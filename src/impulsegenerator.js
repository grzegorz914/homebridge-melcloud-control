"use strict";
const EventEmitter = require('events');

class ImpulseGenerator extends EventEmitter {
    constructor(outputs) {
        super();
        this.outputs = outputs;
        this.timers = [];
        this.timersState = false;
    }

    start() {
        if (this.timersState) {
            this.stop();
        }

        this.outputs.forEach(({ name, interval }) => {
            this.emit(name);

            const timer = setInterval(() => {
                this.emit(name);
            }, interval);
            this.timers.push(timer);

            //update state
            this.timersState = true;
            this.emit('state', true);
        });
    }

    stop() {
        if (this.timersState) {
            this.timers.forEach(timer => clearInterval(timer));
        }

        //update state
        this.timers = [];
        this.timersState = false;
        this.emit('state', false);
    }

    state() {
        this.emit('state', this.timersState);
        return this.timersState;
    }
}
module.exports = ImpulseGenerator;
