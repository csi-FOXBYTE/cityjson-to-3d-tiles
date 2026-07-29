import { ChildProcess } from "child_process";

export type ChildProcessPoolGenerateChildProcessFn = () => ChildProcess;

export class ChildProcessPool {
    private _generateChildProcessFn: ChildProcessPoolGenerateChildProcessFn;
    private _availableChildProcesses: ChildProcess[] = [];
    private _waitQueue: ((value: ChildProcess | PromiseLike<ChildProcess>) => void)[] = [];
    private _maxConcurrency: number;
    private _childProcesses = new Set<ChildProcess>();
    private _debug = false;

    constructor(generateChildProcessFn: ChildProcessPoolGenerateChildProcessFn, maxConcurrency: number, debug = false) {
        this._generateChildProcessFn = generateChildProcessFn;

        this._debug = debug;

        this._maxConcurrency = maxConcurrency;
    }

    private _isChildProcessDead(childProcess: ChildProcess) {
        return childProcess.killed || childProcess.exitCode !== null || childProcess.signalCode !== null;
    }

    private _generateChildProcess() {
        const childProcess = this._generateChildProcessFn();

        this._childProcesses.add(childProcess);

        return childProcess;
    }

    private _destroyChildProcess(childProcess: ChildProcess) {
        this._releaseListeners(childProcess);
        this._childProcesses.delete(childProcess);

        if (!this._isChildProcessDead(childProcess)) childProcess.kill("SIGKILL");
    }

    public acquire() {
        return new Promise<ChildProcess>((resolve) => {
            while (this._availableChildProcesses.length !== 0) {
                const childProcess = this._availableChildProcesses.pop()!;

                if (this._isChildProcessDead(childProcess)) {
                    this._destroyChildProcess(childProcess);

                    if (this._debug) console.log("CHILD_PROCESS was dead");
                } else {
                    if (this._debug) console.log("CHILD_PROCESS was reused");

                    return resolve(childProcess);
                }
            }

            if (this._maxConcurrency > this._childProcesses.size) {
                const childProcess = this._generateChildProcess();

                resolve(childProcess);

                if (this._debug) console.log("CHILD_PROCESS was generated");
            } else {
                this._waitQueue.push(resolve);
                if (this._debug) console.log("CHILD_PROCESS was queued");
            }
        });
    }

    private _releaseListeners(childProcess: ChildProcess) {
        childProcess.removeAllListeners();

        if (childProcess.stderr) childProcess.stderr.removeAllListeners();
        if (childProcess.stdin) childProcess.stdin.removeAllListeners();
        if (childProcess.stdout) childProcess.stdout.removeAllListeners();
    }

    public release(childProcess: ChildProcess, rebuild?: boolean) {
        this._releaseListeners(childProcess);

        if (rebuild || this._isChildProcessDead(childProcess)) {
            this._destroyChildProcess(childProcess);

            if (this._waitQueue.length > 0) {
                const nextResolve = this._waitQueue.shift()!;
                nextResolve(this._generateChildProcess());
            }

            return;
        }

        if (this._waitQueue.length > 0) {
            const nextResolve = this._waitQueue.shift()!;

            nextResolve(childProcess);
        } else {
            this._availableChildProcesses.push(childProcess);
        }
    }

    public destroyAll() {
        this._waitQueue = [];
        this._availableChildProcesses = [];

        for (const childProcess of this._childProcesses) {
            this._destroyChildProcess(childProcess);
        }
    }
};
