import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({window:{addEventListener(){}}});
vm.runInContext(readFileSync(new URL('../dist/kill-details.js',import.meta.url),'utf8'),context);
const api=context.window.SalmonKillDetails;
const job=(kills,appeared,patch={})=>({supported:true,clear:true,players:[{me:false,kills:999},{me:true,kills}],bosses:[{name:'炸弹鱼',me:kills,appeared}],...patch});

test('kill share divides range totals, includes failed matches, and uses the local player',()=>{
  const jobs=[job(1,2),job(9,98,{clear:false}),job(50,100)];
  const result=api.calculate(jobs,0,1);
  assert.equal(result.kills,10);assert.equal(result.appeared,100);assert.equal(result.percent,10);
  assert.equal(result.included,2);assert.equal(result.rows[0].kills,10);
  const single=api.calculate(jobs,1,1);assert.equal(single.kills,9);assert.equal(single.appeared,98);
  assert.equal(api.calculate(jobs).kills,60);
});

test('interrupted or incomplete records never contribute to either total',()=>{
  const result=api.calculate([job(2,10),job(100,100,{interrupted:true}),job(50,100,{supported:false}),job(30,100,{bosses:[{name:'炸弹鱼',me:30,appeared:null}]}),job(20,100,{bosses:[{name:'炸弹鱼',me:null,appeared:100}]})]);
  assert.equal(result.selected,5);assert.equal(result.included,1);assert.equal(result.interrupted,1);assert.equal(result.incomplete,3);
  assert.equal(result.kills,2);assert.equal(result.appeared,10);assert.equal(result.percent,20);
});

test('zero, absent data, per-type aggregation and raw discrepancies remain explicit',()=>{
  assert.equal(api.calculate([]).percent,null);
  assert.equal(api.calculate([job(0,0)]).percent,null);
  assert.equal(api.calculate([job(0,10)]).percent,0);
  assert.equal(api.calculate([job(5,10,{bosses:[]})]).incomplete,1);
  assert.equal(api.calculate([job(0,0,{bosses:[]})]).included,1);
  const result=api.calculate([job(4,10,{bosses:[{name:'炸弹鱼',me:1,appeared:4},{name:'金鲑鱼',me:2,appeared:6}]}),job(1,2)]);
  assert.equal(result.kills,5);assert.equal(result.detailKills,4);assert.equal(result.appeared,12);
  assert.equal(result.rows.find(r=>r.name==='炸弹鱼').kills,2);
  assert.match(api.render(result),/原始记录存在差异/);
  const unsafe=api.render(api.calculate([job(1,2,{bosses:[{name:'<script>',me:1,appeared:2}]})]));
  assert.doesNotMatch(unsafe,/<script>/);assert.match(unsafe,/&lt;script&gt;/);
  assert.match(api.render(api.calculate([])),/没有可统计/);
});

test('export preserves selected range, all rows, exclusions, zero ratios and escaped metadata',()=>{
  const shift={stage:{name:'<场地&>'},start:'2026-10-17T08:00:00Z',end:'2026-10-19T00:00:00Z'};
  const jobs=[job(999,1000,{index:1}),job(4,10,{index:2}),job(100,100,{index:3,interrupted:true}),job(0,0,{index:4})];
  jobs[1].players[1].name='<玩家>';
  const output=api.svg(jobs,shift,1,3);
  assert.match(output.svg,/4 \/ 10 只/);assert.match(output.svg,/40%/);assert.match(output.svg,/本期第 2—4 场/);
  assert.match(output.svg,/统计 2 场 · 排除 1 场掉线/);assert.doesNotMatch(output.svg,/999/);
  assert.match(output.svg,/&lt;场地&amp;&gt;/);assert.match(output.svg,/&lt;玩家&gt;/);
  assert.match(output.svg,/2026\/10\/17 16:00/);assert.match(output.svg,/不含普通小怪和头目/);
  const many=job(0,0,{index:1,bosses:Array.from({length:25},(_,i)=>({name:'怪物'+i,me:0,appeared:0}))});
  const tall=api.svg([many],shift);assert.match(tall.svg,/怪物24/);assert(tall.height>25*42);
  assert.doesNotMatch(tall.svg,/NaN|Infinity/);assert.throws(()=>api.svg([],shift),/no_results/);
});
