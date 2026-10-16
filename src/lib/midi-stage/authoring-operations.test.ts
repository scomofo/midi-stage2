import {describe,expect,it} from "vitest";
import {duplicateRows,quantizeRows,shiftRows} from "./authoring-operations.ts";
const rows=[{id:1,time:"0.123",duration:"0.31",pitch:"60"},{id:2,time:"0.52",duration:"0.2",pitch:"62"}];
describe("authoring operations",()=>{
 it("quantizes only selected rows",()=>{const next=quantizeRows(rows,new Set([1]),.125);expect(next[0]).toMatchObject({time:"0.125",duration:"0.25"});expect(next[1]).toEqual(rows[1]);});
 it("shifts selected rows without allowing negative time",()=>{expect(shiftRows(rows,new Set([1]),-.5)[0]!.time).toBe("0");});
 it("duplicates a selected phrase with fresh ids",()=>{const r=duplicateRows(rows,new Set([1,2]),1,10);expect(r.rows).toHaveLength(4);expect(r.rows.some(x=>x.id===10&&x.time==="1.123")).toBe(true);expect(r.nextId).toBe(12);});
});
