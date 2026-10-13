'use strict';
window.SalmonRecords=(()=>{
  function calculate(jobs){
    let grade=null,eggs=null,kills=null,streak=null,current=[];
    for(const job of jobs){
      if(job.interrupted||job.supported===false){current=[];continue}
      const me=job.players?.find(p=>p.me);
      const rank=window.SalmonGradeChart.rankOf(job),score=job.gradePoint;
      if(rank!==null&&Number.isFinite(score)&&score>=0&&score<=(rank===8?999:100)&&
        (!grade||rank>grade.rank||(rank===grade.rank&&score>grade.value)))grade={job,rank,value:score};
      for(const metric of ['eggs','kills']){
        const value=me?.[metric],previous=metric==='eggs'?eggs:kills;
        if(Number.isFinite(value)&&value>=0&&(!previous||value>previous.value)){
          const record={job,value};if(metric==='eggs')eggs=record;else kills=record;
        }
      }
      if(job.continuousWithPrevious!==true)current=[];
      if(job.clear===true){
        current.push(job);
        if(!streak||current.length>streak.value)streak={job,start:current[0],value:current.length};
      }else current=[];
    }
    return {grade,eggs,kills,streak};
  }
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(jobs){
    const records=calculate(jobs);
    const items=[['grade','最高段位分数',''],['eggs','单场个人搬蛋','颗'],['kills','单场个人巨大鲑鱼击杀','只'],['streak','最长连胜','场']];
    return `<section class="personal-records" aria-labelledby="personal-records-title"><div class="section-heading"><h2 id="personal-records-title">本期个人纪录</h2><span class="subtext">仅本期已保存的有效场次 · 并列取首次</span></div><div class="record-grid">${items.map(([key,label,unit])=>{
      const record=records[key];
      const value=record?(key==='grade'?`${record.job.grade} ${record.value}`:`${record.value} ${unit}`):'暂无记录';
      const note=record?(key==='streak'?`第 ${record.start.index}—${record.job.index} 场 · 查看末场 →`:`第 ${record.job.index} 场 · 查看详情 →`):'等待有效场次';
      const content=`<span class="record-label">${label}</span><strong>${escape(value)}</strong><small>${escape(note)}</small>`;
      return record?`<a class="record-card" href="#${escape(record.job.id)}">${content}</a>`:`<div class="record-card empty">${content}</div>`;
    }).join('')}</div><p class="record-note">数量纪录不代表最佳表现；连胜遇到失败、掉线或缺场重新计数。</p></section>`;
  }
  return {calculate,render};
})();
