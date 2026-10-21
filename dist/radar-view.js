'use strict';
window.SalmonRadarView=(()=>{
  // Keep ranges within this session and shift; never apply one shift's indices to another.
  const ranges=new Map();
  function select(jobs,from=0,to=jobs.length-1){
    const max=jobs.length-1;
    if(max<0)return {from:0,to:-1,jobs:[]};
    from=Math.max(0,Math.min(max,Number.isInteger(from)?from:0));
    to=Math.max(from,Math.min(max,Number.isInteger(to)?to:max));
    return {from,to,jobs:jobs.slice(from,to+1)};
  }
  function mount(root,jobs,shift,player,{single=false}={}){
    let from=0,to=jobs.length-1;
    const saved=!single&&ranges.get(shift.id);
    if(saved){
      const start=jobs.findIndex(j=>j.id===saved.from),end=jobs.findIndex(j=>j.id===saved.to);
      if(start>=0&&end>=start){from=start;to=end}
    }
    const options=value=>jobs.map((j,i)=>`<option value="${i}" ${i===value?'selected':''}>第 ${Number.isInteger(j.index)?j.index:i+1} 场${j.interrupted?' · 掉线':''}</option>`).join('');
    root.innerHTML=`${single?'':`<div class="radar-range" role="group" aria-label="五维图场次范围"><label>起始场次 <select data-radar-from ${jobs.length?'':'disabled'}>${options(from)}</select></label><span>—</span><label>结束场次 <select data-radar-to ${jobs.length?'':'disabled'}>${options(to)}</select></label><button class="button" data-radar-reset ${jobs.length?'':'disabled'}>全部场次</button></div>`}<div data-radar-content></div>`;
    const start=root.querySelector('[data-radar-from]'),end=root.querySelector('[data-radar-to]'),content=root.querySelector('[data-radar-content]');
    function update(){
      const selected=select(jobs,from,to);from=selected.from;to=selected.to;
      if(!single){start.value=String(from);end.value=String(to)}
      content.innerHTML=window.SalmonRadar.render(selected.jobs,{single,compact:single})+window.SalmonRadarExport.controls(selected.jobs);
      window.SalmonRadarExport.bind(selected.jobs,shift,player,{single});
      const help=content.querySelector('.radar-help'),button=help?.querySelector('button'),tip=help?.querySelector('[role="tooltip"]');
      if(help){
        const show=()=>{
          help.classList.remove('dismissed');
          const bounds=button.getBoundingClientRect(),width=Math.min(280,window.innerWidth-24);
          tip.style.width=width+'px';tip.style.left=Math.max(12,Math.min(bounds.left,window.innerWidth-width-12))+'px';
          tip.style.top=Math.max(12,Math.min(bounds.bottom+8,window.innerHeight-tip.offsetHeight-12))+'px';
        };
        help.onpointerenter=show;button.onfocus=show;button.onclick=show;
        button.onkeydown=e=>{if(e.key==='Escape'){help.classList.add('dismissed');e.preventDefault()}};
      }
    }
    function remember(){if(jobs.length)ranges.set(shift.id,{from:jobs[from].id,to:jobs[to].id})}
    if(!single){
      start.onchange=()=>{from=Number(start.value);if(from>to)to=from;remember();update()};
      end.onchange=()=>{to=Number(end.value);if(to<from)from=to;remember();update()};
      root.querySelector('[data-radar-reset]').onclick=()=>{from=0;to=jobs.length-1;ranges.delete(shift.id);update()};
    }
    update();
  }
  return {select,mount};
})();
