import {groupsOf,hash} from './normalize.js';

// NSO history nodes are newest first. Keep evidence from every saved snapshot:
// a rolling window must not erase older adjacency, or bridge unobserved gaps.
export function historyAdjacency(summaries){
  const shifts=new Map();
  for(const summary of summaries){
    for(const group of groupsOf(summary)){
      let edges=shifts.get(group.id);
      if(!edges){edges={next:new Map(),previous:new Map()};shifts.set(group.id,edges)}
      const ids=group.recordIds.map(id=>'job-'+hash(id).slice(0,24));
      if(new Set(ids).size!==ids.length)continue;
      const add=(map,key,value)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(value)};
      for(let i=1;i<ids.length;i++){
        add(edges.next,ids[i],ids[i-1]);add(edges.previous,ids[i-1],ids[i]);
      }
    }
  }
  return (shift,earlier,later)=>{
    const edges=shifts.get(shift),next=edges?.next.get(earlier),previous=edges?.previous.get(later);
    return next?.size===1&&next.has(later)&&previous?.size===1&&previous.has(earlier);
  };
}
