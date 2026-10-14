(function(root){
  function unique(list){return [...new Set((Array.isArray(list)?list:[]).filter(Boolean))]}
  function eligible(state){
    const absent=new Set(unique(state.absent));
    const occupied=new Set(unique(state.occupied));
    return unique(state.people).filter(p=>!absent.has(p)&&!occupied.has(p));
  }
  function order(state){
    const people=unique(state.people), available=eligible(state);
    if(!available.length)return [];
    const start=Math.max(0,available.indexOf(state.nextUp));
    return available.slice(start).concat(available.slice(0,start));
  }
  function nextAfter(state, person){
    const available=eligible(state), people=unique(state.people);
    if(!available.length)return null;
    const start=available.indexOf(person);
    if(start>=0)return available[(start+1)%available.length];
    const pointer=people.indexOf(person);
    return available.find(p=>people.indexOf(p)>pointer)||available[0];
  }
  function transition(state, event){
    const next={...state, people:unique(state.people), absent:unique(state.absent), occupied:unique(state.occupied)};
    const person=event.person;
    if(event.type==='status'){
      next.absent=next.absent.filter(p=>p!==person); next.occupied=next.occupied.filter(p=>p!==person);
      if(event.to==='absent') next.absent.push(person);
      if(event.to==='occupied') next.occupied.push(person);
      if(event.to==='absent' && next.nextUp===person) next.nextUp=nextAfter(next,person);
      // Occupation preserves nextUp: returning staff retain their place.
    }
    if(event.type==='pass' || event.type==='attendance'){
      next.nextUp=nextAfter(next,person||order(next)[0]);
    }
    return next;
  }
  root.QueueLogic={unique,eligible,order,nextAfter,transition};
})(typeof window!=='undefined'?window:globalThis);
