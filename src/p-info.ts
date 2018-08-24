import * as shell from "node-powershell";
import * as TableParser from "table-parser";
import { execPromise } from "./misc";
import { pchan, PChan, Range, TransformChannel, TransformedChannel } from "pchannel";

interface TimeSpan {
    TotalMilliseconds: number;
}

interface WindowsInfoRaw {
    Name: string;
    Id: string;
    PriorityClass: number;
    FileVersion: number;
    HandleCount: number;
    WorkingSet: number;
    PagedMemorySize: number;
    PrivateMemorySize: number;
    VirtualMemorySize: number;
    TotalProcessorTime: TimeSpan;
    SI: number;
    Handles: number;
    VM: number;
    WS: number;
    PM: number;
    NPM: number;
    Path: string;
    Company: string;
    CPU: number;
    ProductVersion: string;
    Description: string;
    Product: string;
    __NounName: string;
    BasePriority: number;
    ExitCode: number|null;
    HasExited: string;
    ExitTime: number|null;
    Handle: number;
    MachineName: string;
    MainWindowHandle: number;
    MainWindowTitle: string;
    MaxWorkingSet: number;
    MinWorkingSet: number;
    NonpagedSystemMemorySize: number;
    NonpagedSystemMemorySize64: number;
    PagedMemorySize64: number;
    PagedSystemMemorySize: number;
    PagedSystemMemorySize64: number;
    PeakPagedMemorySize: number;
    PeakPagedMemorySize64: number;
    PeakWorkingSet: number;
    PeakWorkingSet64: number;
    PeakVirtualMemorySize: number;
    PeakVirtualMemorySize64: number;
    PriorityBoostEnabled: boolean;
    PrivateMemorySize64: number;
    PrivilegedProcessorTime: TimeSpan;
    ProcessName: string;
    ProcessorAffinity: number;
    Responding: boolean;
    SessionId: number;
    StartTime: string;
    SynchronizingObject: null;
    UserProcessorTime: TimeSpan;
    VirtualMemorySize64: number;
    EnableRaisingEvents: boolean;
    StandardInput: null;
    StandardOutput: null;
    StandardError: null;
    WorkingSet64: number;
    Site: null;
    Container: null;
}
function mapWindowsInfo(info: WindowsInfoRaw) {
    return {
        ...info,
        StartTime: new Date(+info.StartTime.slice(6, -2))
    }
}
type WindowsInfo = ReturnType<typeof mapWindowsInfo>;

async function getWindowsInfo(pid: number, fastPowershellCommandRunner?: TransformedChannel<string, string>): Promise<WindowsInfo> {
    
    let command = `get-process -Id ${pid} | Select-Object -Property Name,Id,PriorityClass,FileVersion,HandleCount,WorkingSet,PagedMemorySize,PrivateMemorySize,VirtualMemorySize,TotalProcessorTime,SI,Handles,VM,WS,PM,NPM,Path,Company,CPU,ProductVersion,Description,Product,__NounName,BasePriority,ExitCode,HasExited,ExitTime,Handle,MachineName,MainWindowHandle,MainWindowTitle,MaxWorkingSet,MinWorkingSet,NonpagedSystemMemorySize,NonpagedSystemMemorySize64,PagedMemorySize64,PagedSystemMemorySize,PagedSystemMemorySize64,PeakPagedMemorySize,PeakPagedMemorySize64,PeakWorkingSet,PeakWorkingSet64,PeakVirtualMemorySize,PeakVirtualMemorySize64,PriorityBoostEnabled,PrivateMemorySize64,PrivilegedProcessorTime,ProcessName,ProcessorAffinity,Responding,SessionId,StartTime,SynchronizingObject,UserProcessorTime,VirtualMemorySize64,EnableRaisingEvents,StandardInput,StandardOutput,StandardError,WorkingSet64,Site,Container | ConvertTo-Json`;

    let rawText;
    if(fastPowershellCommandRunner) {
        rawText = await fastPowershellCommandRunner(command);
    } else {
        let ps = new shell({ debugMsg: false });
        ps.addCommand(command);
        rawText = await ps.invoke();
        ps.dispose();
    }

    let rawInfo: WindowsInfoRaw = JSON.parse(rawText);

    return mapWindowsInfo(rawInfo);
}

interface LinuxInfoRaw {
    STARTED: string;
}
//date -d "Thu Jul 12 07:01:47" +%s
//date -j -f "%a %b %d %T %Y" "Wed Jul 25 17:51:03 2018" "+%s"
async function mapLinuxInfo(info: LinuxInfoRaw) {
    let start = String(info.STARTED).replace(/,/g, " ").trim();
    let secondsSinceEpochCommand: string;
    if(process.platform === "darwin") {
        secondsSinceEpochCommand = `date -j -f "%a %b %d %T %Y" "${start}" "+%s"`;
    } else {
        secondsSinceEpochCommand = `date -d "${start}" +%s`;
    }
    let startTime = new Date(+(await execPromise(secondsSinceEpochCommand)) * 1000);
    return {
        StartTime: startTime
    };
}

type UnwrapPromise<T> = T extends Promise<infer U> ? U : never;

type LinuxInfo = UnwrapPromise<ReturnType<typeof mapLinuxInfo>>;
async function getLinuxInfo(pid: number): Promise<LinuxInfo> {
    let linuxRaw = await execPromise(`ps -p ${pid} -o lstart=`);
    let outputLines = linuxRaw.split("\n");
    if(outputLines.length === 0) {
        throw new Error(`Cannot find process ${pid}`);
    }
    return mapLinuxInfo({STARTED: outputLines[0]});
    /*
    let linuxRaw = await execPromise(`ps -p ${pid} -o lstart`);

    let outputLines = TableParser.parse<LinuxInfoRaw>(linuxRaw);
    if(outputLines.length === 0) {
        throw new Error(`Cannot find process ${pid}`);
    }
    return mapLinuxInfo(outputLines[0]);
    */
}

type ProcessInfo = WindowsInfo | LinuxInfo;
export async function GetInfo(pid: number, fastPowershellCommandRunner?: TransformedChannel<string, string>): Promise<ProcessInfo> {
    if(process.platform === "win32") {
        return getWindowsInfo(pid, fastPowershellCommandRunner);
    } else if(process.platform === "linux" || process.platform === "darwin") {
        return getLinuxInfo(pid);
    } else {
        throw new Error(`Unsupported platform ${process.platform}`);
    }
}

export function GetInfoChannel(): ((pid: number) => Promise<ProcessInfo>) & { Close(): void } {
    let fastPowershellCommandRunner: TransformedChannel<string, string> & {Close(): void}|undefined;
    if(process.platform === "win32") {
        let ps = new shell({ debugMsg: false });
        fastPowershellCommandRunner = TransformChannel<string, string>(command => {
            ps.addCommand(command);
            return ps.invoke();
        }, () => {
            ps.dispose();
        });
    }
    return TransformChannel(pid => {
        return GetInfo(pid, fastPowershellCommandRunner);
    }, () => {
        if(fastPowershellCommandRunner) {
            fastPowershellCommandRunner.Close();
        }
    });
}





/*
async function test() {
    let time = +new Date();
    let iterations = 5;
    let requests = Range(0, iterations).map(() => getInfo(36552));
    // Close after filling up the request queue, which will wait until everything is finished executing before killing the powershell process.
    fastPowershellCommand.Close();
    
    let outputs = await Promise.all(requests);
    console.log(outputs.map(x => x.StartTime));

    time = +new Date() - time;
    console.log(`Took ${time / iterations}ms each`);
}
test();

*/