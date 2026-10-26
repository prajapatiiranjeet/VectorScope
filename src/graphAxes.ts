/** Build readable, theme-aware PCA guides and tick labels as one fixed-Y coordinate frame. */
export function createAxisTraces(extent:number,yawDegrees:number,light:boolean):{grid:any;axes:any[]}{
  const formatTick=(value:number,step:number)=>{
    if(value===0)return '0'
    if(step<1e-5||step>=1e6)return value.toExponential(1)
    const digits=Math.min(6,Math.max(0,-Math.floor(Math.log10(step))))
    return Number(value.toFixed(digits)).toString()
  }
  const raw=Math.max(extent/2,1e-9),power=10**Math.floor(Math.log10(raw)),scaled=raw/power
  const step=(scaled<1.5?1:scaled<3.5?2:scaled<7.5?5:10)*power
  const radians=yawDegrees*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians)
  const rotate=(x:number,z:number)=>({x:x*cos+z*sin,z:-x*sin+z*cos})
  const unitX=rotate(1,0),unitZ=rotate(0,1),tickHalf=extent*.014
  const ticks:number[]=[]
  for(let value=Math.ceil(-extent/step)*step;value<=extent+step*.001;value+=step)ticks.push(Math.abs(value)<step*1e-8?0:value)
  const axes=[
    {name:'X',color:light?'#a84226':'#ef9a7b',unit:unitX,vertical:false},
    {name:'Y',color:light?'#126e58':'#75c9a8',unit:{x:0,z:0},vertical:true},
    {name:'Z',color:light?'#3e6488':'#91b4d4',unit:unitZ,vertical:false},
  ]
  const gridX:number[]=[],gridY:number[]=[],gridZ:number[]=[],tickX:number[]=[],tickY:number[]=[],tickZ:number[]=[],labelX:number[]=[],labelY:number[]=[],labelZ:number[]=[],labels:string[]=[],labelColors:string[]=[]
  for(const value of ticks){
    if(Math.abs(value)<step*1e-8)continue
    const xCenter={x:unitX.x*value,z:unitX.z*value},zCenter={x:unitZ.x*value,z:unitZ.z*value}
    gridX.push(xCenter.x-unitZ.x*extent,xCenter.x+unitZ.x*extent,NaN);gridY.push(0,0,NaN);gridZ.push(xCenter.z-unitZ.z*extent,xCenter.z+unitZ.z*extent,NaN)
    gridX.push(zCenter.x-unitX.x*extent,zCenter.x+unitX.x*extent,NaN);gridY.push(0,0,NaN);gridZ.push(zCenter.z-unitX.z*extent,zCenter.z+unitX.z*extent,NaN)
  }
  const lineColors=light?'rgba(65,82,70,.28)':'rgba(190,210,198,.24)',tickColor=light?'rgba(48,63,54,.76)':'rgba(205,220,211,.78)'
  const grid={type:'scatter3d',mode:'lines',x:gridX,y:gridY,z:gridZ,hoverinfo:'skip',showlegend:false,line:{color:lineColors,width:1},name:'Coordinate grid'}
  const traces:any[]=[]
  for(const axis of axes){
    const endX=axis.unit.x*extent,endY=axis.vertical?extent:0,endZ=axis.unit.z*extent
    traces.push({type:'scatter3d',mode:'lines',x:[-endX,endX],y:[-endY,endY],z:[-endZ,endZ],hoverinfo:'skip',showlegend:false,line:{color:axis.color,width:4},name:axis.name+' axis'})
    for(const value of ticks){
      const point=axis.vertical?{x:0,y:value,z:0}:{x:axis.unit.x*value,y:0,z:axis.unit.z*value}
      const half=axis.vertical?{x:unitX.x*tickHalf,y:0,z:unitX.z*tickHalf}:{x:0,y:tickHalf,z:0}
      tickX.push(point.x-half.x,point.x+half.x,NaN);tickY.push(point.y-half.y,point.y+half.y,NaN);tickZ.push(point.z-half.z,point.z+half.z,NaN)
      if(value!==0){
        const offset=axis.vertical?{x:unitX.x*tickHalf*4,y:0,z:unitX.z*tickHalf*4}:{x:0,y:-tickHalf*3,z:0}
        labelX.push(point.x+offset.x);labelY.push(point.y+offset.y);labelZ.push(point.z+offset.z)
        labels.push(formatTick(value,step));labelColors.push(axis.color)
      }
    }
    const label=rotate(axis.unit.x*extent*1.09,axis.unit.z*extent*1.09)
    labelX.push(label.x);labelY.push(axis.vertical?extent*1.09:0);labelZ.push(label.z);labels.push(axis.name);labelColors.push(axis.color)
  }
  traces.push({type:'scatter3d',mode:'lines',x:tickX,y:tickY,z:tickZ,hoverinfo:'skip',showlegend:false,line:{color:tickColor,width:2},name:'Axis ticks'})
  traces.push({type:'scatter3d',mode:'text',x:labelX,y:labelY,z:labelZ,text:labels,textposition:'top center',textfont:{size:10,color:labelColors,family:'Aptos, Segoe UI, sans-serif'},hoverinfo:'skip',showlegend:false,name:'Axis labels'})
  return {grid,axes:traces}
}
