import { describe, expect, it } from 'vitest'
import { compare, parseRows, parseVector, projectPca, search, type RecordRow } from './core'
const row = (id:string, embedding:number[]):RecordRow=>({id,text:id,embedding,metadata:{},row:1,norm:Math.hypot(...embedding)})
describe('safe vector parsing',()=>{
  it('reads JSON and comma separated vectors',()=>{expect(parseVector('[1, 2, 3]')).toEqual([1,2,3]);expect(parseVector('1, 2, 3')).toEqual([1,2,3])})
  it('rejects empty, malformed, and non-finite values',()=>{expect(()=>parseVector('')).toThrow();expect(()=>parseVector('[1, nope]')).toThrow();expect(()=>parseVector('1,,3')).toThrow();expect(()=>parseVector('[1, NaN]')).toThrow()})
})
describe('CSV row validation',()=>{
  const headers=['id','text','embedding_0','embedding_1']
  const config={id:'id',text:'text',vector:'',dims:['embedding_0','embedding_1']}
  it('keeps valid source rows and reports missing numeric dimensions',()=>{const result=parseRows([{id:'a',text:'alpha',embedding_0:'1',embedding_1:'0'},{id:'b',text:'beta',embedding_0:'',embedding_1:'2'}],headers,config);expect(result.records).toHaveLength(1);expect(result.issues[0]).toContain('Row 3')})
  it('reports duplicate IDs and inconsistent dimensions',()=>{const a=parseRows([{id:'x',text:'x',embedding_0:'1',embedding_1:'0'},{id:'x',text:'dup',embedding_0:'2',embedding_1:'1'}],headers,config);expect(a.issues[0]).toContain('duplicate');const b=parseRows([{id:'a',text:'a',embedding:'[1,2]'} as any,{id:'b',text:'b',embedding:'[1,2,3]'} as any],['id','text','embedding'],{id:'id',text:'text',vector:'embedding',dims:[]});expect(b.records).toHaveLength(1);expect(b.issues[0]).toContain('dimensions')})
})
describe('exact similarity search',()=>{
 const records=[row('same',[1,0]),row('diagonal',[1,1]),row('opposite',[-1,0]),row('orthogonal',[0,1])]
 it('calculates cosine scores and sorts descending',()=>{const out=search(records,[1,0],'cosine',4,-1);expect(out.map(x=>x.record.id)).toEqual(['same','diagonal','orthogonal','opposite']);expect(out[1].score).toBeCloseTo(Math.SQRT1_2)})
 it('sorts Euclidean distance ascending and checks dimension mismatch',()=>{const out=search(records,[1,0],'euclidean',4,100);expect(out.map(x=>x.record.id)).toEqual(['same','diagonal','orthogonal','opposite']);expect(out[1].score).toBe(1);expect(()=>search(records,[1],'cosine',2,-1)).toThrow(/dimensions/)})
 it('supports dot-product ranking and rejects cosine for zero vectors',()=>{expect(search(records,[2,0],'dot',4,-100)[0].record.id).toBe('same');expect(()=>compare([0,0],[1,0],'cosine')).toThrow(/zero vector/)})
 it('applies metadata filters and skips zero-vector candidates for cosine search',()=>{const data=[{...row('a',[1,0]),metadata:{category:'one'}},{...row('b',[0,1]),metadata:{category:'two'}},{...row('z',[0,0]),metadata:{category:'one'}}];expect(search(data,[1,0],'cosine',5,-1,undefined,'one','category').map(x=>x.record.id)).toEqual(['a'])})
})
describe('PCA projection',()=>{it('returns one stable 3D coordinate per source ID',()=>{const rows=[row('a',[0,0,0]),row('b',[1,0,0]),row('c',[0,1,0]),row('d',[0,0,1])];const first=projectPca(rows),second=projectPca(rows);expect(first).toHaveLength(rows.length);expect(first.map(x=>x.id)).toEqual(rows.map(x=>x.id));expect(first).toEqual(second);expect(first.every(x=>[x.x,x.y,x.z].every(Number.isFinite))).toBe(true)})})

