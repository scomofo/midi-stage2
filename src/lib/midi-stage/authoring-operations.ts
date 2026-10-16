export type AuthoringRow = {
  id: number;
  time: string;
  duration?: string;
  pitch?: string;
  string?: string;
  fret?: string;
  [key: string]: unknown;
};

function number(text: string | undefined, label: string) {
  if (text === undefined || text.trim() === "" || !Number.isFinite(Number(text))) throw new Error(`${label} needs a number.`);
  return Number(text);
}

export function quantizeRows<T extends AuthoringRow>(rows: T[], selected: Set<number>, stepSeconds: number): T[] {
  if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) throw new Error("Quantize step must be positive.");
  return rows.map(row => {
    if (!selected.has(row.id)) return row;
    const time=number(row.time,"Time");
    const duration=row.duration===undefined?undefined:number(row.duration,"Duration");
    const nextTime=Math.max(0,Math.round(time/stepSeconds)*stepSeconds);
    const nextDuration=duration===undefined?undefined:Math.max(stepSeconds,Math.round(duration/stepSeconds)*stepSeconds);
    return {...row,time:String(Number(nextTime.toFixed(6))),...(nextDuration!==undefined?{duration:String(Number(nextDuration.toFixed(6)))}:{})};
  });
}

export function shiftRows<T extends AuthoringRow>(rows:T[], selected:Set<number>, deltaSeconds:number):T[]{
  if(!Number.isFinite(deltaSeconds)) throw new Error("Timing shift must be a number.");
  return rows.map(row=>selected.has(row.id)?{...row,time:String(Number(Math.max(0,number(row.time,"Time")+deltaSeconds).toFixed(6)))}:row);
}

export function duplicateRows<T extends AuthoringRow>(rows:T[], selected:Set<number>, offsetSeconds:number, nextId:number):{rows:T[];nextId:number}{
  if(!Number.isFinite(offsetSeconds)||offsetSeconds<=0) throw new Error("Duplicate offset must be positive.");
  const copies=rows.filter(row=>selected.has(row.id)).map(row=>({...row,id:nextId++,time:String(Number((number(row.time,"Time")+offsetSeconds).toFixed(6)))}) as T);
  return {rows:[...rows,...copies].sort((a,b)=>Number(a.time)-Number(b.time)||a.id-b.id),nextId};
}

export function remapGuitarRows<T extends AuthoringRow>(rows:T[], selected:Set<number>, tuning:readonly number[], string:number, fretOffset=0):T[]{
  if(!Number.isInteger(string)||string<1||string>6) throw new Error("Target string must be 1–6.");
  if(tuning.length!==6) throw new Error("Guitar tuning needs six pitches.");
  return rows.map(row=>{
    if(!selected.has(row.id)||row.pitch===undefined) return row;
    const pitch=number(row.pitch,"Pitch");
    const fret=pitch-tuning[6-string]!+fretOffset;
    if(!Number.isInteger(fret)||fret<0||fret>24) return row;
    return {...row,string:String(string),fret:String(fret)};
  });
}
