from pathlib import Path
import json, sys, hashlib, base64, urllib.request, concurrent.futures, argparse
from datetime import datetime, timezone
sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser(description='Build a local static Salmon Run snapshot from nxapi exports.')
parser.add_argument('source',type=Path,help='Directory containing nxapi splatnet3-coop result and summary JSON files')
args=parser.parse_args()
SOURCE=args.source
OUT=Path(__file__).resolve().parents[1]/'dist'
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'assets').mkdir(exist_ok=True)
assets={}
def asset(obj):
    url=(obj or {}).get('image',{}).get('url')
    if not url:return ''
    name=hashlib.sha256(url.split('?')[0].encode()).hexdigest()[:18]+'.png'
    assets[name]=url
    return 'assets/'+name
def item(obj):
    return {'name':(obj or {}).get('name','未知'),'image':asset(obj)}

def special(obj):
    obj=obj or {}
    weapon_id=obj.get('weaponId')
    if weapon_id is None and obj.get('id'):
        try:
            decoded=base64.b64decode(obj['id']).decode()
            if decoded.startswith('SpecialWeapon-'):weapon_id=int(decoded.split('-')[-1])
        except (ValueError,UnicodeError):pass
    return dict(**item(obj),weaponId=weapon_id)
def player(p,me=False):
    raw=base64.b64decode(p['player']['id']).decode().split(':')[-1]
    return dict(key=hashlib.sha256(raw.encode()).hexdigest()[:12],name=p['player']['name'],me=me,
                eggs=p.get('goldenDeliverCount'),assist=p.get('goldenAssistCount'),power=p.get('deliverCount'),
                kills=p.get('defeatEnemyCount'),rescues=p.get('rescueCount'),deaths=p.get('rescuedCount'),
                weapons=[item(x) for x in p['weapons']],special=special(p.get('specialWeapon')))
jobs=[]
raw_by_id={}
for f in sorted(SOURCE.glob('splatnet3-coop-result-*.json')):
    j=json.loads(f.read_text(encoding='utf-8'))['result']
    raw_by_id[j['id']]=j
summaries=sorted(SOURCE.glob('splatnet3-coop-summary-*.json'))
if not summaries or not raw_by_id:sys.exit('No nxapi coop summary/results found in source directory.')
summary_file=json.loads(summaries[-1].read_text(encoding='utf-8'))
summary=summary_file['result']
shifts=[]
for i,g in enumerate(summary['historyGroups']['nodes']):
    ids={x['id'] for x in g['historyDetails']['nodes']}
    raw=sorted([j for id,j in raw_by_id.items() if id in ids],key=lambda j:j['playedTime'])
    if not raw:continue
    sid='shift-'+g['startTime'][:10]
    shifts.append(dict(id=sid,start=g['startTime'],end=g['endTime'],total=g['playCount'],loaded=len(raw),
                       stage=item(raw[-1]['coopStage']),weapons=[item(w) for w in raw[-1]['weapons']],rule=g['rule']))
    for n,j in enumerate(raw,1):
        ps=[player(j['myResult'],True)]+[player(p) for p in j['memberResults']]
        waves=[dict(number=w['waveNumber'],tide=['干潮','普通','满潮'][w['waterLevel']],event=(w.get('eventWave') or {}).get('name','普通'),
                    quota=w['deliverNorm'],eggs=w['teamDeliverCount'],appeared=w['goldenPopCount'],specials=[special(s) for s in w['specialWeapons']]) for w in j['waveResults']]
        job=dict(id='job-'+j['playedTime'].replace('-','').replace(':',''),shift=sid,index=n,time=j['playedTime'],rule=g['rule'],
                 stage=item(j['coopStage']),hazard=round(j['dangerRate']*100,1),clear=j['resultWave']==0,failedWave=j['resultWave'],
                 grade=j['afterGrade']['name'] if j.get('afterGrade') else '—',gradePoint=j.get('afterGradePoint'),
                 eggs=sum(w['eggs'] or 0 for w in waves),power=sum(p['power'] or 0 for p in ps),
                 kills=sum(e['teamDefeatCount'] for e in j['enemyResults']),playerKills=sum(p['kills'] or 0 for p in ps),
                 players=ps,waves=waves,bosses=[dict(**item(e['enemy']),me=e['defeatCount'],team=e['teamDefeatCount'],appeared=e['popCount']) for e in j['enemyResults']],
                 king=dict(**item(j['bossResult']['boss']),clear=j['bossResult']['hasDefeatBoss']) if j.get('bossResult') else None,
                 scales=j.get('scale'),jobPoint=j.get('jobPoint'),jobScore=j.get('jobScore'),jobRate=j.get('jobRate'),jobBonus=j.get('jobBonus'))
        job['eggReconciliationDelta']=sum(p['eggs'] or 0 for p in ps)-job['eggs']
        jobs.append(job)
if not jobs:sys.exit('No result IDs match the latest summary.')
data=dict(generated=datetime.now(timezone.utc).isoformat(),language=summary_file.get('language'),timezone='Asia/Hong_Kong',player=jobs[0]['players'][0]['name'],shifts=shifts,jobs=jobs)
(OUT/'data.js').write_text('window.SALMON_DATA = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
def download(pair):
    name,url=pair
    p=OUT/'assets'/name
    if p.exists():return None
    try:
        with urllib.request.urlopen(url,timeout=25) as r:p.write_bytes(r.read())
    except Exception as e:return name+': '+type(e).__name__
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    failures=[r for r in pool.map(download,assets.items()) if r]
print(json.dumps({'jobs':len(jobs),'shifts':[{k:s[k] for k in ['id','total','loaded']} for s in shifts],'assets':len(assets),'asset_errors':failures},ensure_ascii=False))
if failures:sys.exit(1)
