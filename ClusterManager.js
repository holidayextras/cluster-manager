'use strict';

var fs = require('fs');
var cluster = require('cluster');
var exec = require('child_process').exec;
var os = require('os');

var hostname = os.hostname();
var origFork = cluster.fork;

module.exports = function ClusterManager(options) {

  if (!cluster.isMaster) {
    var err = 'Attempting to run cluster inside a clustered process.';
    console.error(err);
    throw new Error(err);
  }

  var config = {};
  if (options.exec === undefined || !fs.existsSync(options.exec)) {
    console.error('File ' + options.exec + ' does not exist.');
    process.exit(65);  // eslint-disable-line no-process-exit
  }

  var numWorkers = options.workers || 2;
  var timeoutBeforeShutdown = options.waitBeforeShutdown || 5000;
  var timeoutBeforeForceExit = options.waitBeforeForceQuit || 10000;
  var pidfile = options.pidfile || null;
  var notify = (fs.existsSync('/usr/lib/sendmail') ? options.notify || null : null);
  var verbose = options.verbose || false;

  config.exec = options.exec;
  config.env = options.env || process.env;
  config.silent = !!(options.silent);

  cluster.setupMaster(config);

  var workerTimeout = {};
  var pid = process.pid;
  var shutdownArray = [];

  var log = function(msg, force) {
    if (verbose || force === true) {
      console.error(new Date() + '    ' + pid + ' ', msg);
    }
  };

  var runningWorkersMsg = function() {
    var currentWorkers = Object.keys(cluster.workers);
    var msg = 'Currently ' + currentWorkers.length + ' running\n';
    for (var i = 0; i < currentWorkers.length; i++) {
      var currentWorker = cluster.workers[currentWorkers[i]];
      msg += '\tWorker[' + currentWorker.id + ']: ' + currentWorker.process.pid + '\n';
    }
    return msg;
  };

  var shutdownWorker = function(worker) {
    worker.cleanShutdown = true;
    worker.disconnect();
    log('worker ' + worker.id + ' (' + worker.process.pid + ') has been asked to shutdown');
    workerTimeout[worker.id] = setTimeout(function() {
      log({ message: 'worker', id: worker.id, state: worker.state, pid: worker.process.pid });
      switch (worker.state) {
      case 'dead':
      case 'disconnected':
        worker = undefined;
        break;
      default:
        worker.disconnect();
        log('Forcing worker ' + worker.id + ' (' + worker.process.pid + ') to die');
        worker.destroy();
        break;
      }
      log(runningWorkersMsg());
    }, timeoutBeforeForceExit);
  };

  cluster.on('exit', function(worker) {
    if (!worker.cleanShutdown) {
      if ((new Date()).getTime() < worker.started + timeoutBeforeShutdown) {
        log('Worker[' + worker.id + '] died too soon. No existing workers will be shutdown');
        clearTimeout(worker.removeOldWorker);
        if (notify !== null) {
          sendNotification(notify, '[' + hostname + '] Worker[' + worker.id + '] died too soon. No existing workers will be shutdown', runningWorkersMsg());  // eslint-disable-line no-use-before-define
        }

      } else {
        if (notify !== null) {
          sendNotification(notify, '[' + hostname + '] Worker[' + worker.id + '] died unexpectedly', runningWorkersMsg());  // eslint-disable-line no-use-before-define
        }
        log('Worker[' + worker.id + '] died unexpectedly');
        cluster.fork();
      }
    } else {
      clearTimeout(workerTimeout[worker.id]);
      var exitCode = worker.process.exitCode;
      log('worker ' + worker.id + ' (' + worker.process.pid + ') terminated (' + exitCode + ').');
    }
    worker.destroy();
  });

  cluster.on('listening', function(worker, address) {
    worker.started = (new Date()).getTime();
    worker.cleanShutdown = false;
    log('Worker ' + worker.id + ' (' + worker.process.pid + ') ' + address.address + ':' + address.port);
    worker.removeOldWorker = setTimeout(function() {
      if (shutdownArray.length > 0) {
        var workerToShutdown = shutdownArray.pop();
        log('New worker[' + worker.id + '] has been up for ' + timeoutBeforeShutdown + 'ms. Asking worker[' + workerToShutdown.id + '] to shutdown');
        shutdownWorker(workerToShutdown);
      }
    }, timeoutBeforeShutdown);
  });

  process.on('SIGHUP', function SIGHUP() {
    log('Rolling restarting request received');
    if (!fs.existsSync(options.exec)) {
      log('File ' + options.exec + " does not exist. Won't restart.", true);
      if (notify !== null) {
        sendNotification(notify, '[' + hostname + '] File ' + options.exec + ' does not exist. Wont restart.', runningWorkersMsg());  // eslint-disable-line no-use-before-define
      }
      return;
    }
    if (notify !== null) {
      sendNotification(notify, '[' + hostname + '] Rolling restart of instances', runningWorkersMsg());  // eslint-disable-line no-use-before-define
    }
    var currentTotal;
    var currentWorkers = Object.keys(cluster.workers);
    var workerID;
    var worker;
    for (currentTotal = 0; currentTotal < numWorkers; currentTotal++) {
      log('Spawning new process...');
      cluster.fork();
      if (currentWorkers.length > 0) {
        workerID = currentWorkers.pop();
        worker = cluster.workers[workerID];
        shutdownArray.push(worker);
      }
    }
    for (workerID in currentWorkers) {
      worker = cluster.workers[currentWorkers[workerID]];
      log('Removing excess workers: ' + worker.id);
      shutdownWorker(worker);
    }

  });

  process.on('SIGUSR1', function SIGUSR1() {
    log(runningWorkersMsg(), true);
  });

  process.on('SIGUSR2', function SIGUSR2() {
    var currentWorkers = Object.keys(cluster.workers).length;
    log('Workers running: ' + currentWorkers + ' - Max Workers: ' + numWorkers);
    if (currentWorkers < numWorkers) {
      log('Starting ' + (numWorkers - currentWorkers) + ' worker(s)');
      for (var currentTotal = 0; currentTotal < (numWorkers - currentWorkers); currentTotal++) {
        cluster.fork();
      }
    }
    log(runningWorkersMsg());
  });

  process.on('SIGTERM', function SIGTERM() {
    log('Termination request received');
    if (notify !== null) {
      sendNotification(notify, '[' + hostname + '] Shutting down all worker instances', runningWorkersMsg());   // eslint-disable-line no-use-before-define
    }
    var currentWorkers = Object.keys(cluster.workers);
    for (var workerID in currentWorkers) {
      var worker = cluster.workers[currentWorkers[workerID]];
      shutdownWorker(worker);
    }

  });

  cluster.fork = function() {
    if (!fs.existsSync(cluster.settings.exec)) {
      console.error('File ' + cluster.settings.exec + " does not exist. Won't FORK.");
      if (notify !== null) {
        sendNotification(notify, '[' + hostname + '] File ' + cluster.settings.exec + ' does not exist. Wont FORK.', runningWorkersMsg());  // eslint-disable-line no-use-before-define
      }
      return;
    }
    origFork();
  };

  log('Master process PID is ' + process.pid);
  if (pidfile !== null) {
    fs.writeFile(pidfile, process.pid, function(error) {
      if (error) {
        console.error('Failed to write PID file: ' + pidfile, error);
        process.exit(1);  // eslint-disable-line no-process-exit
      }
    });
    process.on('exit', function() {
      fs.unlinkSync(pidfile);
    });
  }

    // Fork workers.
  for (var i = 0; i < numWorkers; i++) {
    cluster.fork();
  }
  log(runningWorkersMsg());
};

function sendNotification(options, subject, message) {
  exec(
    "echo 'From:" + options.from + '\nTo:' + options.to + '\nSubject: [' + options.subjectPrefix + ']' + subject + '\n\n' + message + "\n.' | /usr/lib/sendmail -t",
    function(ignoredError, stdout, stderr) {  // eslint-disable-line no-unused-vars
    }
  );
}
