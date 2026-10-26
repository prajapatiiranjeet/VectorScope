import { lazy, Suspense, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, type TouchEvent as ReactTouchEvent } from 'react'
import Papa from 'papaparse'
import { Boxes, Database, Download, Filter, LayoutDashboard, Maximize2, Minimize2, Network, RotateCcw, Search, Settings2, Sun, Moon, Upload, X } from 'lucide-react'
import { AdminDashboard, SupportDashboard } from './RoleDashboards'
import { createAxisTraces } from './graphAxes'
import { createCurvedNeighborTrace } from './graphRelations'
const Plot = lazy(() => import('./Plot3d'))
import { compare, csvEscape, detectColumns, nearestEdges, parseRows, parseVector, projectPca, REQUIRED_EMBEDDING_DIMENSIONS, search, type Metric, type Ranked, type RecordRow } from './core'

type Parsed = { name: string; headers: string[]; rows: Record<string, string>[] }
const formatNumber = (n: number, digits = 3) => Number.isFinite(n) ? n.toFixed(digits) : '—'
type CameraState={zoom:number;center:{x:number;y:number;z:number}}
const INITIAL_CAMERA_STATE:CameraState={zoom:1,center:{x:0,y:0,z:0}}
function zoomCameraAtPoint(current:CameraState,requestedZoom:number,screenX:number,screenY:number):CameraState{
  const zoom=Math.max(.35,Math.min(6,requestedZoom)),fraction=1-current.zoom/zoom
  if(Math.abs(fraction)<1e-8)return current
  const eye={x:1.55,y:1.1,z:1.55},eyeLength=Math.hypot(eye.x,eye.y,eye.z),horizontalLength=Math.hypot(eye.x,eye.z)
  const view={x:-eye.x/eyeLength,y:-eye.y/eyeLength,z:-eye.z/eyeLength}
  const right={x:eye.z/horizontalLength,y:0,z:-eye.x/horizontalLength}
  const up={x:right.y*view.z-right.z*view.y,y:right.z*view.x-right.x*view.z,z:right.x*view.y-right.y*view.x}
  const focusScale=eyeLength/current.zoom*.42
  const offset={x:(right.x*screenX+up.x*screenY)*focusScale,y:(right.y*screenX+up.y*screenY)*focusScale,z:(right.z*screenX+up.z*screenY)*focusScale}
  const clamp=(value:number)=>Math.max(-4,Math.min(4,value))
  return {zoom,center:{x:clamp(current.center.x+offset.x*fraction),y:clamp(current.center.y+offset.y*fraction),z:clamp(current.center.z+offset.z*fraction)}}
}
const sampleRecords: RecordRow[] = [
  ['auth-flow','OAuth token refresh and session rotation','identity',[0.92,0.88,0.08,0.12,0.18]],
  ['login-mfa','Multi-factor authentication with passkeys','identity',[0.86,0.81,0.14,0.13,0.21]],
  ['billing-retry','Retry failed invoices with exponential backoff','payments',[0.08,0.18,0.92,0.84,0.14]],
  ['invoice-webhook','Invoice status webhook delivery and retries','payments',[0.13,0.21,0.84,0.89,0.17]],
  ['search-index','Rebuild the document search index','platform',[0.11,0.08,0.18,0.21,0.94]],
  ['cache-warm','Warm the cache after a deployment','platform',[0.15,0.13,0.12,0.19,0.89]],
  ['role-policy','Access policy evaluation for workspace roles','identity',[0.78,0.84,0.07,0.13,0.24]],
  ['payment-ledger','Append-only ledger for payment events','payments',[0.09,0.16,0.88,0.77,0.22]],
  ['vector-store','Persist vector records and index metadata','platform',[0.18,0.11,0.18,0.15,0.88]],
  ['session-audit','Audit log for sign-in and session events','identity',[0.88,0.78,0.12,0.18,0.25]],
  ['refund-flow','Issue refunds and reconcile processor events','payments',[0.12,0.23,0.81,0.85,0.11]],
  ['search-api','Query the semantic search endpoint','platform',[0.23,0.13,0.21,0.13,0.86]],
].map(([id,text,category,embedding],i)=>({id:String(id),text:String(text),embedding:embedding as number[],metadata:{category:String(category),source:'sample'},row:i+2,norm:Math.hypot(...(embedding as number[]))}))

export default function App() {
  const [records,setRecords] = useState<RecordRow[]>([])
  const [datasetName,setDatasetName] = useState('No dataset loaded')
  const [parsed,setParsed] = useState<Parsed|null>(null)
  const [mapping,setMapping] = useState({id:'',text:'',vector:'',dims:[] as string[]})
  const [issues,setIssues] = useState<string[]>([])
  const [pendingImport,setPendingImport] = useState<RecordRow[]|null>(null)
  const [selected,setSelected] = useState<string|null>(null)
  const [metric,setMetric] = useState<Metric>('cosine')
  const [queryVector,setQueryVector] = useState('')
  const [queryText,setQueryText] = useState('')
  const [searchMode,setSearchMode] = useState<'vector'|'text'>('vector')
  const [embeddingStatus,setEmbeddingStatus] = useState<'idle'|'loading'|'ready'|'error'>('idle')
  const [embeddingProgress,setEmbeddingProgress] = useState(0)
  const embeddingWorkerRef = useRef<Worker|null>(null)
  const embeddingRequestsRef = useRef(new Map<number,{resolve:(embedding:number[])=>void;reject:(error:Error)=>void}>())
  const embeddingRequestIdRef = useRef(0)
  const [topK,setTopK] = useState(5)
  const [threshold,setThreshold] = useState(-1)
  const [results,setResults] = useState<Ranked[]>([])
  const [error,setError] = useState('')
  const [category,setCategory] = useState('all')
  const [filterField,setFilterField] = useState('category')
  const [nav,setNav] = useState('Embedding Explorer')
  const [mode,setMode] = useState<'analytics'|'admin'|'support'>('analytics')
  const [showFilters,setShowFilters] = useState(false)
  const [relations,setRelations] = useState(false)
  const [edgeK,setEdgeK] = useState(3)
  const [yawDegrees,setYawDegrees] = useState(0)
  const [isFullscreen,setIsFullscreen] = useState(false)
  const [isolateMatches,setIsolateMatches] = useState(false)
  const [cameraState,setCameraState] = useState<CameraState>(INITIAL_CAMERA_STATE)
  const graphPanelRef = useRef<HTMLDivElement>(null)
  const plotShellRef = useRef<HTMLElement>(null)
  const pinchStartRef = useRef<{distance:number;camera:CameraState}|null>(null)
  const dragStartRef = useRef<{pointerId:number;startX:number;startYaw:number;moved:boolean}|null>(null)
  const suppressPlotClickRef = useRef(false)
  const [showImport,setShowImport] = useState(false)
  const [showManage,setShowManage] = useState(false)
  const [showSettings,setShowSettings] = useState(false)
  const [light,setLight] = useState(true)
  const [history,setHistory] = useState<{query:string;metric:Metric;count:number;time:string}[]>([])
  const [drag,setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(()=>{
    const syncFullscreen=()=>setIsFullscreen(document.fullscreenElement===graphPanelRef.current)
    document.addEventListener('fullscreenchange',syncFullscreen)
    return ()=>document.removeEventListener('fullscreenchange',syncFullscreen)
  },[])
  useEffect(()=>{
    const onMove=(event:PointerEvent)=>{
      const gesture=dragStartRef.current
      if(!gesture||gesture.pointerId!==event.pointerId)return
      const deltaX=event.clientX-gesture.startX
      if(Math.abs(deltaX)>3)gesture.moved=true
      if(!gesture.moved)return
      event.preventDefault()
      event.stopPropagation()
      setYawDegrees((gesture.startYaw+deltaX*.5+360)%360)
    }
    const onUp=(event:PointerEvent)=>{
      const gesture=dragStartRef.current
      if(!gesture||gesture.pointerId!==event.pointerId)return
      suppressPlotClickRef.current=gesture.moved
      if(gesture.moved)window.setTimeout(()=>{suppressPlotClickRef.current=false},0)
      dragStartRef.current=null
    }
    window.addEventListener('pointermove',onMove,{capture:true,passive:false})
    window.addEventListener('pointerup',onUp,true)
    window.addEventListener('pointercancel',onUp,true)
    return ()=>{
      window.removeEventListener('pointermove',onMove,true)
      window.removeEventListener('pointerup',onUp,true)
      window.removeEventListener('pointercancel',onUp,true)
    }
  },[])
  const picked = records.find((r)=>r.id===selected) ?? null
  const metadataFields = Object.keys(records[0]?.metadata??{})
  const activeField = metadataFields.includes(filterField)?filterField:metadataFields[0]??''
  const categories = [...new Set(records.map(r=>r.metadata[activeField]).filter(Boolean))]
  const filtered = category==='all' ? records : records.filter(r=>r.metadata[activeField]===category)
  const renderedRecords = useMemo(()=>{
    if(filtered.length<=900)return filtered
    const visible=filtered.filter((_,i)=>i%Math.ceil(filtered.length/900)===0).slice(0,900)
    const visibleIds=new Set(visible.map(record=>record.id))
    const filteredById=new Map(filtered.map(record=>[record.id,record]))
    // Keep matches and the selected point in the sampled projection so every result can be located.
    for(const result of results){
      const record=filteredById.get(result.record.id)
      if(record&&!visibleIds.has(record.id)){visible.push(record);visibleIds.add(record.id)}
    }
    const selectedRecord=selected?filteredById.get(selected):undefined
    if(selectedRecord&&!visibleIds.has(selectedRecord.id))visible.push(selectedRecord)
    return visible
  },[filtered,results,selected])
  const resultIds = useMemo(()=>new Set(results.map(result=>result.record.id)),[results])
  const resultById = useMemo(()=>new Map(results.map(result=>[result.record.id,result])),[results])
  const graphRecords = useMemo(()=>isolateMatches&&resultIds.size?renderedRecords.filter(record=>resultIds.has(record.id)):renderedRecords,[renderedRecords,resultIds,isolateMatches])
  const graphRecordIds = useMemo(()=>new Set(graphRecords.map(record=>record.id)),[graphRecords])
  const projection = useMemo(()=>projectPca(renderedRecords),[renderedRecords])
  const originalProjectionById = useMemo(()=>new Map(projection.map(point=>[point.id,point])),[projection])
  // Rotate projected points around logical Y while preserving each point's Y coordinate.
  const rotatedProjection = useMemo(()=>{
    const radians=yawDegrees*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians)
    return projection.map(point=>({...point,x:point.x*cos+point.z*sin,z:-point.x*sin+point.z*cos}))
  },[projection,yawDegrees])
  const projectionById = useMemo(()=>new Map(rotatedProjection.map(point=>[point.id,point])),[rotatedProjection])
  const visibleProjection = rotatedProjection.filter(point=>graphRecordIds.has(point.id))
  const edges = useMemo(()=>relations?nearestEdges(graphRecords,metric,edgeK):[],[graphRecords,metric,edgeK,relations])
  const selectedNeighbors = picked ? records.filter(r=>r.id!==picked.id).flatMap(r=>{try{return [{r,score:compare(picked.embedding,r.embedding,metric)}]}catch{return []}}).sort((a,b)=>metric==='euclidean'?a.score-b.score:b.score-a.score).slice(0,4) : []
  const avgNorm = records.length ? records.reduce((s,r)=>s+r.norm,0)/records.length : 0
  const dim = records[0]?.embedding.length ?? 0
  const plotExtent=Math.max(1e-9,...visibleProjection.map(point=>Math.hypot(point.x,point.z)),...visibleProjection.map(point=>Math.abs(point.y)))*1.08
  const plotData:any[] = []
  const pointData=(record:RecordRow)=>[record.id,record.text.slice(0,88),record.metadata[activeField]??'',formatNumber(record.norm,2)]
  const categoryColor=(record:RecordRow)=>record.metadata[activeField]?['#477b70','#708294','#a2865b'][Math.max(0,categories.indexOf(record.metadata[activeField]))%3]:'#77857e'
  const backgroundPoints=graphRecords.filter(record=>!resultIds.has(record.id)&&record.id!==selected)
  const highlightedPoints=graphRecords.filter(record=>resultIds.has(record.id)||record.id===selected)
  const graphGuides=createAxisTraces(plotExtent,yawDegrees,light)
  plotData.push(graphGuides.grid)
  if(edges.length)plotData.push(createCurvedNeighborTrace(edges,originalProjectionById,yawDegrees,light))
  plotData.push(...graphGuides.axes)
  if(backgroundPoints.length){
    const points=backgroundPoints.map(record=>projectionById.get(record.id)!)
    plotData.push({type:'scatter3d',mode:'markers',x:points.map(point=>point.x),y:points.map(point=>point.y),z:points.map(point=>point.z),customdata:backgroundPoints.map(pointData),hovertemplate:'<b>Record ID: %{customdata[0]}</b><br>%{customdata[1]}<br>Group: %{customdata[2]}<br>Original norm: %{customdata[3]}<extra></extra>',hoverlabel:{bgcolor:light?'#fffdf8':'#172321',bordercolor:light?'#a8b9ae':'#526b62',font:{color:light?'#23332d':'#edf3f7',size:12,family:'Aptos, Segoe UI, sans-serif'}},marker:{size:results.length?4.5:5,color:backgroundPoints.map(categoryColor),opacity:results.length ? 0.26 : 0.78,line:{width:0}},name:'Embeddings'})
  }
  if(highlightedPoints.length){
    const points=highlightedPoints.map(record=>projectionById.get(record.id)!)
    // A soft outer marker gives matches a visible halo without obscuring dense neighborhoods.
    plotData.push({type:'scatter3d',mode:'markers',x:points.map(point=>point.x),y:points.map(point=>point.y),z:points.map(point=>point.z),hoverinfo:'skip',showlegend:false,marker:{size:highlightedPoints.map(record=>record.id===selected?23:18),color:highlightedPoints.map(record=>record.id===selected?'rgba(199,93,59,.18)':'rgba(20,123,101,.18)'),opacity:1,line:{width:0}},name:'Search result halo'})
    plotData.push({type:'scatter3d',mode:'markers',x:points.map(point=>point.x),y:points.map(point=>point.y),z:points.map(point=>point.z),customdata:highlightedPoints.map(pointData),hovertemplate:'<b>%{customdata[0]}</b><br>%{customdata[1]}<br>Group: %{customdata[2]}<br>Original norm: %{customdata[3]}<extra></extra>',hoverlabel:{bgcolor:light?'#fffdf8':'#172321',bordercolor:light?'#a8b9ae':'#526b62',font:{color:light?'#23332d':'#edf3f7',size:12,family:'Aptos, Segoe UI, sans-serif'}},marker:{size:highlightedPoints.map(record=>record.id===selected?13:10),color:highlightedPoints.map(record=>record.id===selected?'#c75d3b':'#147b65'),opacity:1,line:{width:2,color:light?'#fffdf8':'#e7eee8'}},name:results.length?'Search matches':'Selected record'})
  }

  const plotLayout:any={autosize:true,paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',margin:{l:0,r:0,t:4,b:0},showlegend:false,scene:{bgcolor:'rgba(0,0,0,0)',aspectmode:'cube',dragmode:false,xaxis:{visible:false,range:[-plotExtent*1.16,plotExtent*1.16]},yaxis:{visible:false,range:[-plotExtent*1.16,plotExtent*1.16]},zaxis:{visible:false,range:[-plotExtent*1.16,plotExtent*1.16]},camera:{eye:{x:1.55/cameraState.zoom,y:1.1/cameraState.zoom,z:1.55/cameraState.zoom},center:cameraState.center,up:{x:0,y:1,z:0}}},uirevision:'vectorscope'}
  const plotConfig:any={displaylogo:false,responsive:true,scrollZoom:false,modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d','orbitRotation','tableRotation']}

  function navigate(name:string) {
    setNav(name);setShowFilters(false)
    if(name==='Overview')setMode('admin')
    else if(name==='Embedding Explorer'||name==='Similarity Search'||name==='Clusters & Relations')setMode('analytics')
    if(name==='Similarity Search') document.querySelector('.query-entry textarea')?.scrollIntoView({behavior:'smooth',block:'center'})
    if(name==='Clusters & Relations') setRelations(true)
    if(name==='Data Management') setShowManage(true)
    if(name==='Settings') setShowSettings(true)
  }
  function exportDataset() {
    if(!records.length)return
    const headers=['id','text',...Object.keys(records[0].metadata),...records[0].embedding.map((_,i)=>`embedding_${i}`)]
    const lines=[headers.map(csvEscape).join(','),...filtered.map(record=>[record.id,record.text,...Object.values(record.metadata),...record.embedding].map(csvEscape).join(','))]
    download(lines.join('\\r\\n'),'vectorscope-records.csv','text/csv')
  }
  function removeDataset() {
    if(!window.confirm('Remove this dataset from the current browser session? This cannot be undone after this tab closes.'))return
    setRecords([]);setDatasetName('No dataset loaded');setResults([]);setSelected(null);setCategory('all');setFilterField('category');setShowManage(false)
  }  function openFile(file?:File) {
    if(!file)return
    if(file.size>50*1024*1024){setError('This CSV is over the 50 MB browser import limit. Split the file or use a smaller sample.');return}
    Papa.parse<Record<string,string>>(file,{header:true,skipEmptyLines:'greedy',dynamicTyping:false,complete:(result)=>{
      if(!result.meta.fields?.length){setError('No header row was found. Add column names to the first row and try again.');return}
      if(result.errors.length){setError(`CSV parse error on row ${(result.errors[0].row??0)+1}: ${result.errors[0].message}`);return}
      if(result.data.length>100000){setError('This CSV has more than the 100,000 row browser limit. Split the file and import a smaller segment.');return}
      const headers=result.meta.fields, detected=detectColumns(headers)
      setParsed({name:file.name,headers,rows:result.data})
      setMapping({id:detected.id,text:detected.text,vector:detected.dims.length? '' : detected.vector,dims:detected.dims})
      setIssues([]);setPendingImport(null);setError('');setShowImport(true)
    },error:(err)=>setError(`Could not read CSV: ${err.message}`)})
  }
  function importDataset() {
    if(!parsed)return
    if(pendingImport){setRecords(pendingImport);setDatasetName(parsed.name);setResults([]);setSelected(null);setCategory('all');setFilterField('category');setShowImport(false);setParsed(null);setPendingImport(null);setError('');return}
    const validation=parseRows(parsed.rows,parsed.headers,mapping)
    setIssues(validation.issues)
    if(!validation.records.length){if(!validation.issues.length)setIssues(['No usable data rows were found.']);return}
    if(validation.issues.length){setPendingImport(validation.records);return}
    setRecords(validation.records);setDatasetName(parsed.name);setResults([]);setSelected(null);setCategory('all');setFilterField('category');setShowImport(false);setParsed(null);setError('')
  }
  function loadSample() {setRecords(sampleRecords);setDatasetName('Product architecture sample · synthetic');setResults([]);setSelected(null);setCategory('all');setFilterField('category');setError('')}
  function runSearch(vectorText=queryVector,exclude?:string,historyLabel=vectorText) {
    setError('')
    try {const q=parseVector(vectorText);const next=search(records,q,metric,topK,threshold,exclude,category==='all'?undefined:category,activeField);setResults(next);setIsolateMatches(next.length>0);if(next.length)setSelected(next[0].record.id);setHistory(h=>[{query:historyLabel.slice(0,72),metric,count:next.length,time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})},...h].slice(0,8))}
    catch(e){setError((e as Error).message);setResults([]);setIsolateMatches(false)}
  }
  function requestTextEmbedding(text:string):Promise<number[]> {
    if(!embeddingWorkerRef.current){
      const worker=new Worker(new URL('./embedding.worker.ts',import.meta.url),{type:'module'})
      worker.onmessage=(event:MessageEvent<any>)=>{
        const message=event.data
        if(message.type==='progress'){
          if(typeof message.progress==='number')setEmbeddingProgress(Math.max(0,Math.min(100,Math.round(message.progress))))
          return
        }
        if(message.type==='status'){
          if(message.status==='loading')setEmbeddingStatus('loading')
          return
        }
        const pending=embeddingRequestsRef.current.get(message.id)
        if(!pending)return
        embeddingRequestsRef.current.delete(message.id)
        if(message.type==='result')pending.resolve(message.embedding as number[])
        else pending.reject(new Error(message.message||'Text embedding failed.'))
      }
      worker.onerror=(event)=>{
        setEmbeddingStatus('error')
        embeddingRequestsRef.current.forEach(({reject})=>reject(new Error(event.message||'The local embedding worker failed.')))
        embeddingRequestsRef.current.clear()
      }
      embeddingWorkerRef.current=worker
    }
    const id=++embeddingRequestIdRef.current
    setEmbeddingStatus('loading');setEmbeddingProgress(0)
    return new Promise((resolve,reject)=>{
      embeddingRequestsRef.current.set(id,{resolve,reject})
      embeddingWorkerRef.current!.postMessage({id,text})
    })
  }
  async function runTextSearch(){
    const text=queryText.trim()
    if(!text||!records.length)return
    if(dim!==REQUIRED_EMBEDDING_DIMENSIONS){setError(`Text search requires ${REQUIRED_EMBEDDING_DIMENSIONS}D all-MiniLM vectors. The current dataset has ${dim} dimensions.`);return}
    setError('')
    try{
      const embedding=await requestTextEmbedding(text)
      setEmbeddingStatus('ready');setEmbeddingProgress(100)
      runSearch(JSON.stringify(embedding),undefined,text)
    }catch(error){
      setEmbeddingStatus('error')
      setError(`Could not create a text embedding. ${(error as Error).message}`)
    }
  }
  function exportResults() {
    if(!results.length)return
    const headers=['rank','id','score','text',...Object.keys(results[0].record.metadata)]
    const lines=[headers.map(csvEscape).join(','),...results.map(x=>[x.rank,x.record.id,x.score,x.record.text,...Object.values(x.record.metadata)].map(csvEscape).join(','))]
    download(lines.join('\r\n'),'vectorscope-search-results.csv','text/csv')
  }
  function download(content:string,name:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
  function downloadIssues(){download(['issue',...issues].map(csvEscape).join('\n'),'vectorscope-import-issues.csv','text/csv')}
  function handleGraphPointerDown(event:ReactPointerEvent<HTMLDivElement>){
    if(event.button!==0)return
    const target=event.target
    if(target instanceof HTMLElement&&target.closest('button,input,select,a,.modebar'))return
    dragStartRef.current={pointerId:event.pointerId,startX:event.clientX,startYaw:yawDegrees,moved:false}
  }
  function plotScreenPosition(clientX:number,clientY:number){
    const bounds=plotShellRef.current?.getBoundingClientRect()
    if(!bounds||bounds.width===0||bounds.height===0)return null
    return {x:((clientX-bounds.left)/bounds.width)*2-1,y:1-((clientY-bounds.top)/bounds.height)*2}
  }
  function handleGraphWheel(event:ReactWheelEvent<HTMLDivElement>){
    const target=event.target
    if(!(target instanceof HTMLElement)||!target.closest('.plot-shell'))return
    const point=plotScreenPosition(event.clientX,event.clientY)
    if(!point)return
    event.preventDefault();event.stopPropagation()
    setCameraState(current=>zoomCameraAtPoint(current,current.zoom*Math.exp(-event.deltaY*.0012),point.x,point.y))
  }
  function handleGraphTouchStart(event:ReactTouchEvent<HTMLDivElement>){
    if(event.touches.length!==2||!plotShellRef.current?.contains(event.target as Node))return
    const [a,b]=[event.touches[0],event.touches[1]]
    pinchStartRef.current={distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),camera:cameraState}
    dragStartRef.current=null
  }
  function handleGraphTouchMove(event:ReactTouchEvent<HTMLDivElement>){
    const start=pinchStartRef.current
    if(!start||event.touches.length!==2)return
    const [a,b]=[event.touches[0],event.touches[1]],distance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)
    const point=plotScreenPosition((a.clientX+b.clientX)/2,(a.clientY+b.clientY)/2)
    if(!point)return
    event.preventDefault();event.stopPropagation()
    setCameraState(zoomCameraAtPoint(start.camera,start.camera.zoom*distance/start.distance,point.x,point.y))
  }
  function handleGraphTouchEnd(event:ReactTouchEvent<HTMLDivElement>){if(event.touches.length<2)pinchStartRef.current=null}
  function handlePlotClick(event:any){
    if(suppressPlotClickRef.current){suppressPlotClickRef.current=false;return}
    const recordId=event.points?.[0]?.customdata?.[0]
    if(recordId!==undefined&&recordId!==null)setSelected(String(recordId))
  }
  async function toggleGraphFullscreen(){
    const graph=graphPanelRef.current
    if(!graph)return
    try{
      if(document.fullscreenElement)await document.exitFullscreen()
      else await graph.requestFullscreen()
    }catch{setError('Full-screen mode is unavailable in this browser.')}
  }
  function exportProjection(){download(['id,x,y,z',...projection.map(p=>`${csvEscape(p.id)},${p.x},${p.y},${p.z}`)].join('\n'),'vectorscope-pca-projection.csv','text/csv')}

  return <div className={light?'app light':'app'} onDragOver={(e)=>{e.preventDefault();setDrag(true)}} onDragLeave={(e)=>{if(e.currentTarget===e.target)setDrag(false)}} onDrop={(e)=>{e.preventDefault();setDrag(false);openFile(e.dataTransfer.files[0])}}>
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><span></span><span></span><span></span><span></span></div><div><strong>VectorScope</strong><small>Embedding studio</small></div></div>
      <div className="project-select"><span className="project-orb"></span><div><small>WORKSPACE</small><strong>{datasetName}</strong></div><span className="chevron">⌄</span></div>
      <div className="top-metrics"><span><b>{records.length.toLocaleString()}</b> vectors</span><i></i><span><b>{dim||'—'}</b> dimensions</span><i></i><span className="status"><em></em>{records.length?'Session ready':'Waiting for data'}</span></div>
      <div className="header-actions"><div className="role-switch" aria-label="Dashboard view">{[['analytics','Analyst'],['admin','Admin'],['support','Support']].map(([key,label])=><button key={key} type="button" aria-pressed={mode===key} className={mode===key?'role-tab active':'role-tab'} onClick={()=>{setMode(key as 'analytics'|'admin'|'support');setNav(key==='admin'?'Overview':key==='support'?'Data Management':'Embedding Explorer');setSelected(null);setShowFilters(false)}}>{label}</button>)}</div><button className="icon-button" title={light?'Switch to dark theme':'Switch to light theme'} onClick={()=>setLight(!light)} aria-label={light?'Switch to dark theme':'Switch to light theme'}>{light?<Moon size={15}/>:<Sun size={15}/>}</button><button className="button primary" onClick={()=>fileRef.current?.click()}><Upload size={15}/> Import CSV</button><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e=>openFile(e.target.files?.[0])}/></div>
    </header>
    <div className="app-body">
      <nav className="rail" aria-label="Main navigation">
        <div className="rail-group">{[{name:'Overview',Icon:LayoutDashboard},{name:'Embedding Explorer',Icon:Boxes},{name:'Similarity Search',Icon:Search},{name:'Clusters & Relations',Icon:Network}].map(({name,Icon})=><button key={name} aria-label={name} title={name} data-short={name==='Embedding Explorer'?'Explore':name==='Similarity Search'?'Search':name==='Clusters & Relations'?'Relations':name} aria-current={nav===name?'page':undefined} className={nav===name?'rail-item active':'rail-item'} onClick={()=>navigate(name)}><Icon size={16} strokeWidth={1.8}/><span>{name}</span></button>)}</div>
        <div className="rail-extras"><button className="rail-item" aria-label="Data management" title="Data management" onClick={()=>navigate('Data Management')}><Database size={15}/><span>Data</span></button><button className="rail-item" aria-label="Settings" title="Settings" onClick={()=>navigate('Settings')}><Settings2 size={15}/><span>Settings</span></button></div>
        <div className="rail-bottom"><span className="session-dot"></span><small>LOCAL SESSION</small></div>
      </nav>
      <aside className={showFilters?"left-panel drawer open":"left-panel drawer"} aria-label="Dataset and filters">
        <div className="panel-heading"><div><small className="eyebrow">DATA CONTROLS</small><h2>Dataset & filters</h2></div><button className="icon-button tiny" onClick={()=>setShowFilters(false)} title="Close filters" aria-label="Close filters"><X size={14}/></button></div>
        {records.length? <>
          <div className="dataset-card"><div className="dataset-icon"><Database size={16}/></div><div className="dataset-name"><strong>{datasetName}</strong><small>Imported in this session</small></div><span className="more">···</span></div>
          <div className="section-label">Dataset profile</div><div className="stats-list"><div><span>Records</span><b>{records.length.toLocaleString()}</b></div><div><span>Dimensions</span><b>{dim}</b></div><div><span>Metadata fields</span><b>{Object.keys(records[0]?.metadata??{}).length}</b></div><div><span>Mean vector norm</span><b>{formatNumber(avgNorm)}</b></div></div>
          <div className="section-label filter-title">Filters <button className="text-button" onClick={()=>setCategory('all')}>Reset</button></div>
          {metadataFields.length>0&&<><label className="field-label">Metadata field</label><select className="select-control" value={activeField} onChange={e=>{setFilterField(e.target.value);setCategory('all')}}>{metadataFields.map(field=><option key={field} value={field}>{field}</option>)}</select></>}<label className="field-label">Value</label><select className="select-control" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories · {records.length}</option>{categories.map(c=><option key={c} value={c}>{c} · {records.filter(r=>r.metadata[activeField]===c).length}</option>)}</select>
          <div className="section-label projection-title">Projection</div><div className="projection-card"><div className="projection-icon">✳</div><div><strong>Principal components</strong><small>PCA · computed from original vectors</small></div><span className="check">✓</span></div>
          <div className="projection-foot">Showing {renderedRecords.length.toLocaleString()} of {filtered.length.toLocaleString()} points; exact search still uses every filtered vector.</div>
        </>:<div className="empty-dataset"><div className="empty-glyph">⠿</div><strong>No embeddings yet</strong><p>Import a CSV with exactly 384 numeric embedding values per record to explore your vectors in 3D.</p><button className="button secondary full" onClick={()=>fileRef.current?.click()}>Choose a CSV</button><button className="text-button sample-link" onClick={loadSample}>Explore a synthetic sample</button><small>Sample data is clearly labeled and never mixed with your imports.</small></div>}
        <div className="local-note"><span>⌑</span><p>Your data stays in this browser session. Nothing is uploaded.</p></div>
      </aside>
      <main className="workspace">{mode==='analytics'?<>
        <div className="workspace-head"><div><div className="breadcrumbs">EXPLORATION <span>/</span> {nav.toUpperCase()}</div><h1>{nav==='Embedding Explorer'?'Embedding landscape':nav==='Overview'?'Dataset overview':nav}</h1><p>{records.length?'Inspect neighborhoods, then verify each match against its original vector.':'Load a dataset to begin exploring its vector space.'}</p></div><div className="workspace-tools"><button className="tool-button" aria-pressed={showFilters} aria-expanded={showFilters} onClick={()=>setShowFilters(!showFilters)} title="Open dataset filters"><Filter size={14}/><span>Filters</span></button><button className={relations?'tool-button selected':'tool-button'} aria-pressed={relations} onClick={()=>setRelations(!relations)} disabled={!records.length} title="Toggle computed nearest-neighbor edges"><Network size={14}/><span>Relations</span></button><button className="tool-button" onClick={exportProjection} disabled={!projection.length} title="Export PCA projection"><Download size={14}/><span>Export</span></button></div></div>
        <div ref={graphPanelRef} className={isFullscreen?'visualization-panel is-fullscreen':'visualization-panel'} onPointerDownCapture={handleGraphPointerDown} onWheelCapture={handleGraphWheel} onTouchStartCapture={handleGraphTouchStart} onTouchMoveCapture={handleGraphTouchMove} onTouchEndCapture={handleGraphTouchEnd}><div className="viz-bar"><div className="viz-mode"><span className="live-dot"></span><strong>3D embedding map</strong><span className="mode-divider"></span><span className="algo-pill">PCA</span><span className="mode-note">Search always uses original vectors</span></div><div className="viz-actions">{categories.length?categories.slice(0,3).map((name,i)=><span className="legend-item" key={name} title={name}><i className="legend-dot" style={{background:['#477b70','#708294','#a2865b'][i]}}></i><span className="legend-name">{name}</span></span>):<span className="legend-item"><i className="legend-dot blue"></i><span className="legend-name">Records</span></span>}<span className="legend-divider"></span>{results.length>0&&<button className={isolateMatches?'tool-button selected isolation-toggle':'tool-button isolation-toggle'} type="button" aria-pressed={isolateMatches} onClick={()=>setIsolateMatches(value=>!value)} title={isolateMatches?'Restore every graph point':'Show only search matches'} aria-label={isolateMatches?'Show all graph points':'Isolate matching search points'}>{isolateMatches?'Show all':'Isolate matches'}</button>}<button className="icon-button tiny" title="Reset selection" onClick={()=>setSelected(null)}><X size={13}/></button><button className="icon-button" type="button" title="Reset zoom and rotation" aria-label="Reset zoom and rotation" onClick={()=>{setCameraState(INITIAL_CAMERA_STATE);setYawDegrees(0)}}><RotateCcw size={15}/></button><button className="icon-button" type="button" aria-label={isFullscreen?'Exit full screen':'Enter full screen'} aria-pressed={isFullscreen} title={isFullscreen?'Exit full screen':'Enter full screen'} onClick={toggleGraphFullscreen}>{isFullscreen?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button></div></div>
        <div className="axis-rotation-control"><label htmlFor="axis-yaw">Rotate around fixed Y</label><input id="axis-yaw" aria-label="Rotate plotted embeddings around the fixed vertical Y axis" type="range" min="0" max="360" step="1" value={yawDegrees} onChange={e=>setYawDegrees(Number(e.target.value))}/><output htmlFor="axis-yaw">{Math.round(yawDegrees)}°</output><button className="text-button" type="button" onClick={()=>setYawDegrees(0)}>Reset</button></div>
        {relations&&projection.length>0&&<div className="edge-count"><span role="status" aria-live="polite" aria-atomic="true">{edges.length} undirected neighbor links</span><label htmlFor="edge-count-k">k =</label><select id="edge-count-k" aria-label="Number of neighbors" value={edgeK} onChange={e=>setEdgeK(Number(e.target.value))}><option value={1}>1</option><option value={3}>3</option><option value={5}>5</option></select></div>}
        <section ref={plotShellRef} className="plot-shell" aria-label="Interactive three dimensional embedding visualization">
          {projection.length?<>
            <Suspense fallback={<div className="plot-loading">Preparing the 3D renderer…</div>}><Plot key={`${records.length}-${category}`} data={plotData} layout={plotLayout} config={plotConfig} useResizeHandler style={{width:'100%',height:'100%'}} onClick={handlePlotClick} onSelected={(ev:any)=>{const id=ev.points?.[0]?.customdata?.[0];if(id)setSelected(String(id))}} /></Suspense>
            <div className="plot-hint">Drag or use the Y control · Scroll to zoom · Click a point to inspect</div>
            <div className="plot-coordinates"><span>DISPLAY SPACE</span><b>3 principal components</b><small>Relative position is approximate; ranking uses {metric} in {dim}D.</small></div>

          </>:<div className="plot-empty"><div className="empty-orbit"><span></span><span></span><span></span></div><strong>Your vector field starts here</strong><p>Import an embeddings CSV to project your records into a navigable 3D space.</p><button className="button primary" onClick={()=>fileRef.current?.click()}>Import embeddings</button><button className="text-button" onClick={loadSample}>Or explore a labeled sample</button></div>}
        </section>
        <div className="workspace-footer"><span><i className="footer-led"></i>Projection: <b>PCA</b></span><span>Original dimensions: <b>{dim||'—'}</b></span><span>Points in view: <b>{filtered.length>renderedRecords.length?`${renderedRecords.length.toLocaleString()} / ${filtered.length.toLocaleString()}`:renderedRecords.length.toLocaleString()}</b></span><span className="footer-spacer"></span><span className="footer-disclaimer">3D distance does not represent exact similarity</span></div></div>
        {error&&<div className="inline-error" role="alert"><span>!</span>{error}<button onClick={()=>setError('')} aria-label="Dismiss error">×</button></div>}
        <section className="search-dock">
          <div className="dock-top"><div className="dock-title"><span className="search-mark">⌕</span><div><strong>Find similar vectors</strong><small>Compare a query against original embeddings</small></div></div><div className="search-tabs"><button className={searchMode==='vector'?'active':''} aria-pressed={searchMode==='vector'} onClick={()=>setSearchMode('vector')}>Query vector</button><button className={searchMode==='text'?'active':''} aria-pressed={searchMode==='text'} onClick={()=>{setSearchMode('text');setError('')}}>Text query</button></div></div>
          <div className="dock-controls"><div className="query-entry"><textarea value={searchMode==='text'?queryText:queryVector} onChange={e=>searchMode==='text'?setQueryText(e.target.value):setQueryVector(e.target.value)} placeholder={searchMode==='text'?'Describe what you want to find…':records.length?`Paste ${dim} values, e.g. [0.12, 0.45, 0.89]`:'Import vectors to enable similarity search'} disabled={!records.length} aria-label={searchMode==='text'?'Text query':'Query vector'}/><button className="button primary search-button" disabled={!records.length||(searchMode==='text'?(dim!==REQUIRED_EMBEDDING_DIMENSIONS||!queryText.trim()||embeddingStatus==='loading'):!queryVector.trim())} onClick={()=>searchMode==='text'?void runTextSearch():runSearch()}>{searchMode==='text'?(embeddingStatus==='loading'?'Creating embedding…':'Search text'):'Search'} <span>⌕</span></button>{searchMode==='text'&&<div className="model-status" role="status"><span>{dim!==REQUIRED_EMBEDDING_DIMENSIONS?`Requires 384D all-MiniLM vectors · current dataset: ${dim}D`:embeddingStatus==='loading'&&embeddingProgress>0?`Downloading MiniLM · ${embeddingProgress}%`:embeddingStatus==='loading'?'Preparing text embedding…':embeddingStatus==='ready'?'MiniLM ready · embedding created on this device':'First use downloads ~23 MB; the browser can cache the model'}</span>{embeddingStatus==='loading'&&<span className="model-progress" role="progressbar" aria-label="Downloading MiniLM model" aria-valuemin={0} aria-valuemax={100} aria-valuenow={embeddingProgress}><i style={{width:`${embeddingProgress}%`}} /></span>}</div>}</div><div className="search-options"><label>Metric<select value={metric} onChange={e=>{const next=e.target.value as Metric;setMetric(next);setThreshold(next==='euclidean'?1000000000:-1)}}><option value="cosine">Cosine similarity</option><option value="euclidean">Euclidean distance</option><option value="dot">Dot product</option></select></label><label>Top K<select value={topK} onChange={e=>setTopK(Number(e.target.value))}><option>5</option><option>10</option><option>20</option><option>50</option></select></label><label>{metric==='euclidean'?'Max distance':'Min score'}<input type="number" step="0.05" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}/></label></div></div>
          {results.length===0&&history.length>0&&<div className="history-wrap"><div className="history-heading">Recent searches <button className="text-button" onClick={()=>setHistory([])}>Clear</button></div>{history.slice(0,3).map((item,i)=><button className="history-row" key={`${item.time}-${i}`} onClick={()=>{setQueryVector(item.query);setMetric(item.metric)}}><span>⌕</span><b>{item.query.slice(0,34)}</b><small>{item.metric} · {item.count} results · {item.time}</small><em>Use again</em></button>)}</div>}          {results.length>0&&<div className="results-wrap"><div className="results-heading"><div><strong>{results.length} nearest records</strong><small>Ranked by {metric} · original {dim}D vectors</small></div><button className="text-button" onClick={exportResults}>Export CSV ⇩</button><button className="icon-button tiny" onClick={()=>{setResults([]);setIsolateMatches(false)}} aria-label="Clear results">×</button></div><div className="result-list">{results.map(result=><button key={result.record.id} className={selected===result.record.id?'result-row selected':'result-row'} onClick={()=>setSelected(result.record.id)}><span className="rank">{String(result.rank).padStart(2,'0')}</span><span className="result-copy"><b>{result.record.id}</b><small>{result.record.text||'No text field'}</small></span><span className="result-category">{result.record.metadata[activeField]??'—'}</span><strong className="score">{formatNumber(result.score,4)}</strong><span className="open-arrow">↗</span></button>)}</div></div>}
        </section>
        </>:mode==='admin'?<AdminDashboard records={records} datasetName={datasetName} issues={issues} history={history} onImport={()=>fileRef.current?.click()} onExplore={()=>{setMode('analytics');setNav('Embedding Explorer')}}/>:<SupportDashboard records={records} issues={issues} onImport={()=>fileRef.current?.click()} onDownload={downloadIssues}/>}</main>
      <aside className={mode==='analytics'&&picked?'right-panel inspector-drawer open':'right-panel inspector-drawer'} aria-label="Selected record details">
        <div className="inspector-head"><div><small className="eyebrow">INSPECTOR</small><h2>{picked?'Record details':'Point details'}</h2></div><button className="icon-button tiny" onClick={()=>setSelected(null)} title="Close inspector" aria-label="Close inspector"><X size={14}/></button></div>
        {picked?<><div className="record-id-row"><span className="record-dot"></span><div><small>RECORD ID</small><strong>{picked.id}</strong></div><button className="copy-button" onClick={()=>navigator.clipboard?.writeText(picked.id)} title="Copy ID">▢</button></div><div className="inspector-scroll">
          <div className="inspector-section"><label>CONTENT</label><p className="record-text">{picked.text||'No text or content column was mapped.'}</p></div>
          <div className="inspector-section"><label>METADATA</label>{Object.entries(picked.metadata).filter(([k,v])=>v&&k!=='source').length?<div className="metadata-list">{Object.entries(picked.metadata).filter(([k,v])=>v&&k!=='source').map(([key,value])=><div key={key}><span>{key}</span><b>{value}</b></div>)}</div>:<p className="quiet">No metadata fields were imported.</p>}</div>
          <div className="inspector-section"><label>VECTOR PROFILE</label><div className="profile-grid"><div><small>Original dimensions</small><b>{picked.embedding.length}</b></div><div><small>Vector norm</small><b>{formatNumber(picked.norm,4)}</b></div><div><small>CSV row</small><b>{picked.row}</b></div>{resultById.has(picked.id)&&<div><small>Search rank</small><b>#{resultById.get(picked.id)?.rank} · {formatNumber(resultById.get(picked.id)!.score,4)}</b></div>}</div><p className="coordinate-note">Original vector and projected coordinates are distinct. The values below are the PCA display position.</p><div className="coord-row">{['x','y','z'].map(axis=><div key={axis}><small>PC {axis.toUpperCase()}</small><b>{formatNumber((originalProjectionById.get(picked.id) as any)?.[axis]??0,4)}</b></div>)}</div><details className="vector-details"><summary>Original vector preview <span>{picked.embedding.length} values</span></summary><code>{picked.embedding.slice(0,18).map(n=>formatNumber(n,4)).join(', ')}{picked.embedding.length>18?' …':''}</code></details><button className="text-button use-vector" onClick={()=>{setQueryVector(JSON.stringify(picked.embedding));document.querySelector('.query-entry textarea')?.scrollIntoView({behavior:'smooth',block:'center'})}}>Use this vector as a query ↓</button></div>          <div className="inspector-section neighbors-section"><label>NEAREST RECORDS <span>· {metric}</span></label>{selectedNeighbors.map(({r,score})=><button key={r.id} className="neighbor-row" onClick={()=>setSelected(r.id)}><span className="neighbor-dot"></span><span><b>{r.id}</b><small>{r.text}</small></span><strong>{formatNumber(score,3)}</strong></button>)}</div>
        </div></>:<div className="inspector-empty"><div className="crosshair">＋</div><strong>Nothing selected</strong><p>Choose a point in the map or a result to inspect its source record and original vector.</p><div className="inspect-tip"><span>⌖</span><p>Projected coordinates are for display. Similarity is always calculated from the original vectors.</p></div></div>}
        <div className="inspector-bottom"><div className="data-status"><span className="status-check">✓</span><span><b>Local processing</b><small>Vectors remain in this browser session</small></span></div><button className="more-action" title="Data management" onClick={()=>setNav('Data Management')}>···</button></div>
      </aside>
    </div>
    <footer className="app-credit">Made with <span aria-hidden="true">❤️</span> by Ranjeet Prajapati</footer>
    {showManage&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setShowManage(false)}}><section className="import-modal manage-modal" role="dialog" aria-modal="true" aria-labelledby="manage-title"><div className="modal-head"><div><small className="eyebrow">DATA MANAGEMENT</small><h2 id="manage-title">Your session dataset</h2><p>Datasets are kept in memory for this browser session only.</p></div><button className="icon-button" onClick={()=>setShowManage(false)} aria-label="Close data management">×</button></div>{records.length?<><div className="manage-card"><span className="file-icon">▤</span><div><strong>{datasetName}</strong><small>{records.length.toLocaleString()} records · {dim} dimensions · {Object.keys(records[0].metadata).length} metadata fields</small></div></div><label className="manage-label">Dataset name<input value={datasetName} onChange={e=>setDatasetName(e.target.value)} /></label><div className="manage-actions"><button className="button secondary" onClick={exportDataset}>Export {filtered.length} filtered rows</button><button className="button secondary" onClick={()=>{setShowManage(false);fileRef.current?.click()}}>Import another CSV</button><button className="button danger-button" onClick={removeDataset}>Remove dataset</button></div></>:<div className="empty-manage"><p>No dataset is loaded.</p><button className="button primary" onClick={()=>{setShowManage(false);fileRef.current?.click()}}>Import CSV</button></div>}<div className="modal-foot"><span>Imported vectors are never modified by projection or search.</span></div></section></div>}
    {showSettings&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setShowSettings(false)}}><section className="import-modal manage-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="modal-head"><div><small className="eyebrow">PREFERENCES</small><h2 id="settings-title">Workspace settings</h2><p>Appearance and local processing details.</p></div><button className="icon-button" onClick={()=>setShowSettings(false)} aria-label="Close settings">×</button></div><div className="settings-row"><span><b>Color theme</b><small>Choose the interface appearance.</small></span><button className="button secondary" onClick={()=>setLight(!light)}>{light?'Light':'Dark'} · Switch</button></div><div className="settings-note"><strong>Privacy</strong><p>CSV files and vectors stay in browser memory. Reloading or closing this tab clears the imported data.</p></div><div className="settings-note"><strong>Projection and search</strong><p>Principal components are used for the 3D view. Similarity search uses full original vectors, independent of the projection.</p></div><div className="modal-foot"><span>Text queries are embedded locally with all-MiniLM-L6-v2. The model downloads on first use; query text stays on this device.</span></div></section></div>}    {showImport&&<div className="modal-backdrop" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setShowImport(false)}}><section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal-head"><div><small className="eyebrow">DATA INGESTION</small><h2 id="import-title">Import embeddings</h2><p>Choose a CSV and map its fields. Every record must contain exactly 384 numeric embedding values.</p></div><button className="icon-button" onClick={()=>{setShowImport(false);setParsed(null)}} aria-label="Close import">×</button></div>
      {!parsed?<div className={drag?'dropzone dragging':'dropzone'} onClick={()=>fileRef.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);openFile(e.dataTransfer.files[0])}}><div className="upload-mark">⇧</div><strong>Drop a CSV file here</strong><span>or choose a file from your device</span><button className="button secondary">Choose CSV</button><small>CSV only · up to 50 MB · parsed locally in your browser</small></div>:<><div className="file-summary"><span className="file-icon">▤</span><div><strong>{parsed.name}</strong><small>{parsed.rows.length.toLocaleString()} rows · {parsed.headers.length} columns · {parsed.headers.length>0?'UTF-8 / browser detected':'unknown encoding'}</small></div><button className="text-button" onClick={()=>setParsed(null)}>Change file</button></div><div className="step-label">Column mapping <span>384 values per record · review detected fields</span></div><div className="mapping-grid"><label>Record ID<select value={mapping.id} onChange={e=>{setPendingImport(null);setIssues([]);setMapping({...mapping,id:e.target.value})}}><option value="">Select column</option>{parsed.headers.map(h=><option key={h}>{h}</option>)}</select></label><label>Text / content <span className="optional">optional</span><select value={mapping.text} onChange={e=>{setPendingImport(null);setIssues([]);setMapping({...mapping,text:e.target.value})}}><option value="">None</option>{parsed.headers.map(h=><option key={h}>{h}</option>)}</select></label><label>Vector column<select value={mapping.vector} onChange={e=>{setPendingImport(null);setIssues([]);setMapping({...mapping,vector:e.target.value,dims:[]})}}><option value="">Use separate dimensions below</option>{parsed.headers.map(h=><option key={h}>{h}</option>)}</select><small>Exactly 384 values · JSON array or comma-separated</small></label><label>Embedding dimensions <span className="optional">multi-select</span><select multiple value={mapping.dims} onChange={e=>{setPendingImport(null);setIssues([]);setMapping({...mapping,vector:'',dims:Array.from(e.target.selectedOptions).map(o=>o.value)})}}>{parsed.headers.map(h=><option key={h}>{h}</option>)}</select><small>Select exactly 384 numeric columns</small></label></div><div className="preview-title">Preview <span>First 3 rows</span></div><div className="preview-table"><table><thead><tr>{parsed.headers.slice(0,6).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{parsed.rows.slice(0,3).map((row,i)=><tr key={i}>{parsed.headers.slice(0,6).map(h=><td key={h}>{String(row[h]??'').slice(0,48)}</td>)}</tr>)}</tbody></table></div>{issues.length>0&&<div className="issue-box"><strong>{issues.length} row issue{issues.length===1?'':'s'} found</strong><p>{issues.slice(0,3).join(' ')}</p><button className="text-button" onClick={downloadIssues}>Download issue report</button></div>}<div className="modal-foot"><span>Invalid rows are reported; they are never silently discarded.</span><button className="button primary" onClick={importDataset}>{pendingImport?`Import ${pendingImport.length.toLocaleString()} valid rows`:`Validate & import`} <span>→</span></button></div></>}
    </section></div>}
    {drag&&<div className="global-drop"><div><strong>Drop CSV to start import</strong><span>CSV files are parsed locally</span></div></div>}
  </div>
}
