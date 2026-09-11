export function AmbientNetwork() {
  const points = [[5,15],[17,34],[30,9],[45,27],[63,11],[80,32],[95,16],[9,74],[27,61],[43,84],[60,65],[76,88],[92,68]];
  const links = [[0,1],[0,2],[1,3],[1,8],[2,3],[2,4],[3,4],[3,9],[4,5],[5,6],[5,10],[6,12],[7,8],[8,9],[8,10],[9,10],[9,11],[10,11],[10,12],[11,12]];
  return <svg className="atmosphere" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="line-fade"><stop stopColor="#89C2D9" stopOpacity=".04"/><stop offset=".5" stopColor="#89C2D9" stopOpacity=".2"/><stop offset="1" stopColor="#58B9DF" stopOpacity=".03"/></linearGradient></defs>{links.map(([a,b],i)=><line key={i} x1={points[a][0]} y1={points[a][1]} x2={points[b][0]} y2={points[b][1]} stroke="url(#line-fade)" strokeWidth=".08"/>)}{points.map(([x,y],i)=><circle key={i} cx={x} cy={y} r=".22" fill="#BCECEC" opacity=".42"/>)}</svg>;
}
