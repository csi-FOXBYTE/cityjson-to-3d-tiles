import { ChildProcess } from "child_process";

export type ChildProcessPoolGenerateChildProcessFn = () => ChildProcess;

export class ChildProcessPool {
    private _generateChildProcessFn: ChildProcessPoolGenerateChildProcessFn;
    private _availableChildProcesses: ChildProcess[] = [];
    private _waitQueue: ((value: ChildProcess | PromiseLike<ChildProcess>) => void)[] = [];
    private _maxConcurrency: number;
    private _instantiatedChildProcessCount: number = 0;
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

        this._instantiatedChildProcessCount++;

        return childProcess;
    }

    public acquire() {
        return new Promise<ChildProcess>((resolve) => {
            if (this._availableChildProcesses.length !== 0) {
                let childProcess = this._availableChildProcesses.pop()!;

                if (this._isChildProcessDead(childProcess)) {
                    this._instantiatedChildProcessCount--;

                    childProcess = this._generateChildProcess();

                    if (this._debug) console.log("CHILD_PROCESS was dead");
                } else {
                    if (this._debug) console.log("CHILD_PROCESS was reused")
                }

                return resolve(childProcess);
            }

            if (this._maxConcurrency > this._instantiatedChildProcessCount) {
                const childProcess = this._generateChildProcess();

                resolve(childProcess);

                if (this._debug) console.log("CHILD_PROCESS was generated")
            } else {
                this._waitQueue.push(resolve);
                if (this._debug) console.log("CHILD_PROCESS was reused")
            }
        })
    }

    public _releaseListeners(childProcess: ChildProcess) {
        childProcess.removeAllListeners();

        if (childProcess.stderr) childProcess.stderr.removeAllListeners();
        if (childProcess.stdin) childProcess.stdin.removeAllListeners();
        if (childProcess.stdout) childProcess.stdout.removeAllListeners();
    }

    public release(childProcess: ChildProcess, rebuild?: boolean) {
        this._releaseListeners(childProcess);

        let currentChildProcess = childProcess;

        if (rebuild) {
            childProcess.kill("SIGKILL");

            this._instantiatedChildProcessCount--;

            currentChildProcess = this._generateChildProcess();
        }

        if (this._isChildProcessDead(currentChildProcess)) {
            this._instantiatedChildProcessCount--;

            currentChildProcess = this._generateChildProcess();
        }

        if (this._waitQueue.length > 0) {
            const nextResolve = this._waitQueue.shift()!;

            nextResolve(currentChildProcess);
        } else {
            this._availableChildProcesses.push(currentChildProcess);
        }
    }

    public destroyAll() {
        this._waitQueue = [];

        while (this._availableChildProcesses.length > 0) {
            const childProcess = this._availableChildProcesses.pop()!;

            this._releaseListeners(childProcess);

            if (!this._isChildProcessDead(childProcess)) childProcess.kill("SIGKILL");
        }

        this._instantiatedChildProcessCount = 0;
    }
};