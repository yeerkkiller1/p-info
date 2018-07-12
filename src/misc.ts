import { exec } from "child_process";

export function execPromise(command: string) {
    return new Promise<string>((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            error = error || stderr;
            if(error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}