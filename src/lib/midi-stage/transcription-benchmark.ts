export type BenchmarkNote = { time:number; duration:number; pitch:number };
export type BenchmarkResult = {
  reference:number; detected:number; matched:number;
  precision:number; recall:number; f1:number;
  meanOnsetErrorMs:number|null; meanDurationErrorMs:number|null;
};

export function scoreTranscription(reference:BenchmarkNote[], detected:BenchmarkNote[], options:{onsetToleranceMs?:number;durationToleranceMs?:number;pitchTolerance?:number}={}):BenchmarkResult{
  const onsetTol=(options.onsetToleranceMs??60)/1000;
  const durationTol=(options.durationToleranceMs??180)/1000;
  const pitchTol=options.pitchTolerance??0;
  const used=new Set<number>(); const errors:Array<{onset:number;duration:number}>=[];
  for(const ref of reference){
    let best=-1,bestCost=Infinity;
    detected.forEach((candidate,index)=>{
      if(used.has(index)||Math.abs(candidate.pitch-ref.pitch)>pitchTol)return;
      const onset=Math.abs(candidate.time-ref.time); if(onset>onsetTol)return;
      const duration=Math.abs(candidate.duration-ref.duration); if(duration>durationTol)return;
      const cost=onset+duration*.25;
      if(cost<bestCost){best=index;bestCost=cost;}
    });
    if(best>=0){used.add(best);const hit=detected[best]!;errors.push({onset:Math.abs(hit.time-ref.time),duration:Math.abs(hit.duration-ref.duration)});}
  }
  const matched=errors.length;
  const precision=detected.length?matched/detected.length:reference.length?0:1;
  const recall=reference.length?matched/reference.length:detected.length?0:1;
  const f1=precision+recall?2*precision*recall/(precision+recall):0;
  const mean=(key:"onset"|"duration")=>errors.length?errors.reduce((s,e)=>s+e[key],0)/errors.length*1000:null;
  return {reference:reference.length,detected:detected.length,matched,precision,recall,f1,meanOnsetErrorMs:mean("onset"),meanDurationErrorMs:mean("duration")};
}

export function benchmarkPass(result:BenchmarkResult,{minF1=.8,maxOnsetMs=80,maxDurationMs=200}={}){
  return result.f1>=minF1 && (result.meanOnsetErrorMs??0)<=maxOnsetMs && (result.meanDurationErrorMs??0)<=maxDurationMs;
}
