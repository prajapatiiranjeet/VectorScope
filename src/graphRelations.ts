type ProjectionPoint={id:string;x:number;y:number;z:number}
type RelationEdge={source:string;target:string;score:number}

function hashPair(source:string,target:string){
  const key=[source,target].sort().join('|')
  let hash=2166136261
  for(let i=0;i<key.length;i++){hash^=key.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return hash>>>0
}

/** Route neighbor links as stable, gently bowed curves and rotate them with the PCA body. */
export function createCurvedNeighborTrace(edges:RelationEdge[],points:Map<string,ProjectionPoint>,yawDegrees:number,light:boolean){
  const x:number[]=[],y:number[]=[],z:number[]=[],radians=yawDegrees*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians)
  for(const edge of edges){
    const a=points.get(edge.source),b=points.get(edge.target)
    if(!a||!b)continue
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,distance=Math.hypot(dx,dy,dz)
    if(distance<1e-9)continue
    const direction={x:dx/distance,y:dy/distance,z:dz/distance}
    const reference=Math.abs(direction.y)<.88?{x:0,y:1,z:0}:{x:1,y:0,z:0}
    let normal={x:direction.y*reference.z-direction.z*reference.y,y:direction.z*reference.x-direction.x*reference.z,z:direction.x*reference.y-direction.y*reference.x}
    const normalLength=Math.hypot(normal.x,normal.y,normal.z)||1
    normal={x:normal.x/normalLength,y:normal.y/normalLength,z:normal.z/normalLength}
    const hash=hashPair(edge.source,edge.target),sign=(hash&1)?1:-1,bend=distance*(.045+((hash>>>1)%7)*.012)*sign
    const control={x:(a.x+b.x)/2+normal.x*bend,y:(a.y+b.y)/2+normal.y*bend,z:(a.z+b.z)/2+normal.z*bend}
    for(let segment=0;segment<=8;segment++){
      const t=segment/8,u=1-t
      const px=u*u*a.x+2*u*t*control.x+t*t*b.x,py=u*u*a.y+2*u*t*control.y+t*t*b.y,pz=u*u*a.z+2*u*t*control.z+t*t*b.z
      x.push(px*cos+pz*sin);y.push(py);z.push(-px*sin+pz*cos)
    }
    x.push(NaN);y.push(NaN);z.push(NaN)
  }
  return {type:'scatter3d',mode:'lines',x,y,z,hoverinfo:'skip',showlegend:false,line:{color:light?'rgba(51,76,60,.52)':'rgba(157,185,169,.48)',width:light?2.2:1.8},name:'Computed neighbors'}
}
