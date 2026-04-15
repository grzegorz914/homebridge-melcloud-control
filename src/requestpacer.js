export default class RequestPacer {
    constructor({ interval = 200, concurrency = 1 } = {}) {
        this.interval = interval;
        this.concurrency = concurrency;

        this.queue = [];
        this.active = 0;
    }

    async run(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.next();
        });
    }

    async next() {
        if (this.active >= this.concurrency) return;
        if (this.queue.length === 0) return;

        const task = this.queue.shift();
        this.active++;

        try {
            const result = await task.fn();
            task.resolve(result);
        } catch (err) {
            task.reject(err);
        } finally {
            this.active--;

            setTimeout(() => {
                this.next();
            }, this.interval);
        }
    }
}