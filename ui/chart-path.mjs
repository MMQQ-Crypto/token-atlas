// Shape-preserving cubic interpolation: pass through each daily value without
// overshooting adjacent values (especially important around zero-token days).
export function smoothPath(points){return smoothCurve(points).path;}
export function smoothCurve(points){
  if(!points.length)return {path:'',at:()=>null};
  const start=`M${points[0][0]},${points[0][1]}`;
  if(points.length===1)return {path:start,at:()=>({x:points[0][0],y:points[0][1]})};
  const widths=[],slopes=[];
  for(let i=1;i<points.length;i++){
    const h=points[i][0]-points[i-1][0];
    widths.push(h);slopes.push((points[i][1]-points[i-1][1])/h);
  }
  const tangents=[slopes[0]];
  for(let i=1;i<points.length-1;i++){
    const before=slopes[i-1],after=slopes[i];
    const w1=2*widths[i]+widths[i-1],w2=widths[i]+2*widths[i-1];
    tangents.push(before*after>0?(w1+w2)/(w1/before+w2/after):0);
  }
  tangents.push(slopes.at(-1));
  const path=start+points.slice(1).map(([x,y],i)=>{
    const [px,py]=points[i],third=widths[i]/3;
    return ` C${px+third},${py+third*tangents[i]} ${x-third},${y-third*tangents[i+1]} ${x},${y}`;
  }).join('');
  // The cubic's x controls are at thirds, so x is linear in t. Use the same
  // controls for pointer hit testing; token counts still come from daily rows.
  const at=value=>{
    const x=Math.max(points[0][0],Math.min(points.at(-1)[0],value));
    let lo=0,hi=points.length-2;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(points[mid][0]<=x)lo=mid;else hi=mid-1;}
    const i=lo,t=(x-points[i][0])/widths[i],a=1-t,third=widths[i]/3;
    const y=a**3*points[i][1]+3*a*a*t*(points[i][1]+third*tangents[i])+3*a*t*t*(points[i+1][1]-third*tangents[i+1])+t**3*points[i+1][1];
    return {x,y};
  };
  return {path,at};
}
