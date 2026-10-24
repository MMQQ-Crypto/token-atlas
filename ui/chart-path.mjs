// Shape-preserving cubic interpolation: pass through each daily value without
// overshooting adjacent values (especially important around zero-token days).
export function smoothPath(points){
  if(!points.length)return '';
  const start=`M${points[0][0]},${points[0][1]}`;
  if(points.length===1)return start;
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
  return start+points.slice(1).map(([x,y],i)=>{
    const [px,py]=points[i],third=widths[i]/3;
    return ` C${px+third},${py+third*tangents[i]} ${x-third},${y-third*tangents[i+1]} ${x},${y}`;
  }).join('');
}
