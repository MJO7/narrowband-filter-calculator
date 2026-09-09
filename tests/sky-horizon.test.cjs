const {test} = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const Sky = require('../sky-horizon.js');
const Astronomy = require('../vendor/astronomy-2.1.19.min.js');
const close = (a,b,tolerance=1e-8) => assert.ok(Math.abs(a-b)<tolerance, `${a} ≠ ${b}`);

test('cardinals lie at 0° altitude at northern, southern, equatorial and polar sites',()=>{
  for(const date of ['1900-01-01T00:00:00Z','2000-01-01T12:00:00Z','2026-09-09T19:45:00Z','2100-12-31T23:59:00Z']){
    for(const [lat,lon] of [[0,0],[19.076,72.8777],[-33.8688,151.2093],[51.4779,0],[90,180],[-90,-180]]){
      const when=new Date(date), frame=Sky.createFrame(when,lat,lon);
      for(const az of [0,90,180,270]){
        const [ra,dec]=Sky.toEquatorial(frame,az,0);
        const horizontal=Sky.toHorizontal(frame,ra,dec);
        close(horizontal.altitude,0);
        close(Math.sin((horizontal.azimuth-az)*Math.PI/180),0);
        // Independent scalar Horizon calculation in equator-of-date coordinates.
        const t=Astronomy.MakeTime(when);
        const j2000=Astronomy.VectorFromSphere(new Astronomy.Spherical(dec,ra,1),t);
        const eq=Astronomy.EquatorFromVector(Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(t),j2000));
        const reference=Astronomy.Horizon(t,new Astronomy.Observer(lat,lon,0),eq.ra,eq.dec,null);
        close(reference.altitude,0);
      }
      close(Sky.toHorizontal(frame,...Sky.toEquatorial(frame,0,90)).altitude,90);
      close(Sky.toHorizontal(frame,...Sky.toEquatorial(frame,0,-90)).altitude,-90);
    }
  }
});

test('date changes preserve horizontal pointing and shift the celestial field',()=>{
  const before=Sky.createFrame(new Date('2026-09-09T00:00:00Z'),19.076,72.8777);
  const after=Sky.createFrame(new Date('2026-09-09T02:00:00Z'),19.076,72.8777);
  const initial=Sky.toEquatorial(before,125,30), next=Sky.toEquatorial(after,125,30);
  const horizontal=Sky.toHorizontal(after,...next);
  close(horizontal.azimuth,125); close(horizontal.altitude,30);
  assert.ok(Math.abs(next[0]-initial[0])>20);
  assert.ok(Math.abs(Sky.toHorizontal(after,...initial).altitude-30)>1);
});

test('local date parsing, leap years, DST gaps/folds and minute precision',()=>{
  const modulePath=path.resolve(__dirname,'../sky-horizon.js');
  const parse=(zone,date,time)=>JSON.parse(execFileSync(process.execPath,['-e',
    `const s=require(${JSON.stringify(modulePath)});console.log(JSON.stringify(s.parseLocalTime(${JSON.stringify(date)},${JSON.stringify(time)}).map(d=>d.toISOString())))`
  ],{env:{...process.env,TZ:zone},encoding:'utf8'}));
  assert.deepEqual(parse('Asia/Kolkata','2026-09-09','00:15'),['2026-09-08T18:45:00.000Z']);
  assert.deepEqual(parse('UTC','2024-02-29','23:59'),['2024-02-29T23:59:00.000Z']);
  assert.deepEqual(parse('UTC','2026-02-29','12:00'),[]);
  assert.deepEqual(parse('UTC','2026-09-09','24:00'),[]);
  assert.deepEqual(parse('America/New_York','2026-03-08','02:30'),[]);
  assert.deepEqual(parse('America/New_York','2026-11-01','01:30'),['2026-11-01T05:30:00.000Z','2026-11-01T06:30:00.000Z']);
  assert.deepEqual(parse('Australia/Lord_Howe','2026-04-05','01:45'),['2026-04-04T14:45:00.000Z','2026-04-04T15:15:00.000Z']);
});

class PathRecorder{
  constructor(){this.polygons=[];this.current=null;}
  moveTo(x,y){this.current=[[x,y]];this.polygons.push(this.current);}
  lineTo(x,y){this.current.push([x,y]);}
  closePath(){}
  rect(x,y,w,h){this.polygons.push([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);}
  area(){return this.polygons.reduce((sum,points)=>sum+Math.abs(points.reduce((area,p,i)=>{const q=points[(i+1)%points.length];return area+p[0]*q[1]-q[0]*p[1];},0))/2,0);}
}

test('ground clips the correct side for horizontal, vertical, diagonal and offscreen horizons',()=>{
  const W=128,H=128;
  for(const sample of [(x,y)=>y-64,(x,y)=>64-y,(x,y)=>x-64,(x,y)=>x+y-128]){
    const ground=new PathRecorder(),edge=new PathRecorder();
    Sky.groundPaths(W,H,sample,ground,edge);
    close(ground.area(),W*H/2);
    assert.ok(edge.polygons.length>0);
    for(const points of edge.polygons) for(const [x,y] of points) close(sample(x,y),0);
  }
  for(const [value,expected] of [[1,0],[-1,W*H],[null,0]]){
    const ground=new PathRecorder(),edge=new PathRecorder();
    Sky.groundPaths(W,H,()=>value,ground,edge); close(ground.area(),expected);
  }
});
