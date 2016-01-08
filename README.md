cluster-manager
===============

## Purpose

To manage apps that want to use nodejs cluster module. This module will restart workers on failure and allows rolling restarts. It can send email notifications on worker failure.

## Install

```bash
npm install -g cluster-manager
```

## Usage
```node
var clusterManager = require('cluster-manager');

clusterManager({
    exec:"/PATH/TO/APPLICATION",
    workers: 5,
    notify:{
        from:"from@address.com",
        to:"recipient@address.com",
        subjectPrefix:"SUBJECT PREFIX"
    }
});
```
## Options

Below are the keys that can be set in the JSON object. They are all optional except for __exec__.

<dl>
    <dt>exec</dt>
    <dd>node application that will be started by the cluster</dd>

    <dt>workers</dt>
    <dd>number of workers that will be spawned. Default:2</dd>

    <dt>pidfile</dt>
    <dd>File to store the ID for the main process. Used to send signals to the cluster manager</dd>

    <dt>notify</dt>
    <dd>Object with a <i>from</i>, <i>to</i> and <i>subjectPrefix</i> property. If set, the recipient will receive email notifications on events that affect the workers. To send notifications, it requires __/usr/lib/sendmail__.</dd>

    <dt>verbose</dt>
    <dd>Handles if the cluster-manager will be verbose in its messages. Default:false</dd>

    <dt>silent</dt>
    <dd>Determines if the worker stdout streams are silent. Default:false</dd>

    <dt>env</dt>
    <dd>Object with the environment variables passed on to the workers</dd>

    <dt>waitBeforeShutdown</dt>
    <dd>How long to wait after reloading workers to confirm reload was successful. After this time, the old workers will be shut down.</dd>

    <dt>waitBeforeForceQuit</dt>
    <dd>How long to wait before the cluster manager will force a worker to shutdown after the initial shutdown request</dd>
</dl>

## Signals

While the cluster manager is running, you can send signals.

*To reload workers - start new ones and shut down the old ones.

> kill -HUP MASTERPID

*To output to stdout number of workers and their PIDs

> kill -USR1 MASTERPID

*To increase running workers to the maximum number set at the start

> kill -USR2 MASTERPID

*To attempt graceful shutdown

> kill -TERM MASTERPID


## NPM Maintainers

The npm module for this library is maintained by:

* [Roger Castells](http://github.com/rogerc)
* [Viktor Trako](http://github.com/viktort)
* [Dan Jenkins](http://github.com/danjenkins)
* [Pedro Romano](http://github.com/hx-pedro-romano)

## License

cluster-manager is licensed under the MIT license.
