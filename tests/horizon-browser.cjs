// Run with Playwright installed, or set PLAYWRIGHT_MODULE to its module path.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'text/plain');
    res.end(data);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:960},timezoneId:'Asia/Kolkata'});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/fov-calculator.html`);
    await page.waitForFunction(()=>typeof skySimulation!=='undefined' && skySimulation!==null,{timeout:60000});
    await page.evaluate(()=>{
      document.querySelector('#timeSection .sectionToggle').click();
      document.getElementById('observerLatitude').value='19.076';
      document.getElementById('observerLongitude').value='72.8777';
      document.getElementById('applyObserver').click();
    });
    await page.locator('#simulationDate').fill('2026-09-09');
    await page.locator('#simulationTime').fill('20:00');
    assert.equal(await page.locator('#simulationWeekday').textContent(),'Wednesday');
    await page.evaluate(()=>{
      const set=(id,value)=>document.getElementById(id).value=value;
      set('fl','600'); set('mainPA','37');
      document.querySelector('input[name="maincam"][value="asi2600"]').checked=true;
      document.getElementById('showMosaic').checked=true;
      set('mosaicCamera','asi294');set('mosaicTelescope','c8');set('mosaicFl','2032');
      set('mosaicCols','3');set('mosaicRows','2');set('mosaicRotation','51');
      aladin.setFoV(50);aladin.setRotation(23);
      const frame=SkyHorizon.createFrame(new Date('2026-09-09T14:30:00Z'),19.076,72.8777);
      aladin.gotoRaDec(...SkyHorizon.toEquatorial(frame,90,0));
      update();
    });
    await page.waitForTimeout(700);
    const snapshot=()=>page.evaluate(()=>({fov:aladin.getFoV(),rotation:aladin.getRotation(),raDec:aladin.getRaDec(),svg:document.getElementById('graphics').innerHTML,mainPA:document.getElementById('mainPA').value,mosaicPA:document.getElementById('mosaicRotation').value}));
    const before=await snapshot();
    await page.locator('#simulationTime').fill('22:00');
    await page.waitForTimeout(400);
    const after=await snapshot();
    assert.deepEqual(after.fov,before.fov);assert.ok(Math.abs(after.rotation-before.rotation)<1e-10);
    assert.equal(after.svg,before.svg);assert.equal(after.mainPA,before.mainPA);assert.equal(after.mosaicPA,before.mosaicPA);
    assert.notDeepEqual(after.raDec,before.raDec);
    const pointing=await page.evaluate(()=>SkyHorizon.toHorizontal(SkyHorizon.createFrame(new Date('2026-09-09T16:30:00Z'),19.076,72.8777),...aladin.getRaDec()));
    assert.ok(Math.abs(pointing.altitude)<1e-6);assert.ok(Math.abs(pointing.azimuth-90)<1e-6);

    // Check opacity against independent per-pixel altitude classification.
    const inspectGround=()=>page.evaluate(()=>{
      const canvas=document.getElementById('horizonCanvas'),ctx=canvas.getContext('2d');
      const w=document.getElementById('viewer').clientWidth,h=document.getElementById('viewer').clientHeight;
      const dpr=canvas.width/w, data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const frame=SkyHorizon.createFrame(new Date('2026-09-09T16:30:00Z'),19.076,72.8777);
      let below=0,above=0;const mismatches=[];
      for(let y=35;y<h-35;y+=47)for(let x=35;x<w-35;x+=47){
        let eq;try{eq=aladin.pix2world(x,y,'ICRS');}catch(_){continue;}
        if(!eq || !eq.every(Number.isFinite))continue;
        const alt=SkyHorizon.toHorizontal(frame,...eq).altitude;
        const offset=(Math.floor(y*dpr)*canvas.width+Math.floor(x*dpr))*4;
        const alpha=data[offset+3];
        const isGround=data[offset]===25 && data[offset+1]===39 && data[offset+2]===36;
        if(alt < -0.5){below++;if(alpha!==255)mismatches.push({x,y,alt,alpha});}
        // Cardinal labels intentionally occupy a few pixels ABOVE altitude 0°.
        if(alt > 0.5){above++;if(isGround && alpha!==0)mismatches.push({x,y,alt,alpha});}
      }
      return {below,above,mismatches};
    });
    let ground=await inspectGround();assert.ok(ground.below>0 && ground.above>0);assert.deepEqual(ground.mismatches,[]);
    await page.evaluate(()=>aladin.setRotation(113));await page.waitForTimeout(400);
    ground=await inspectGround();assert.deepEqual(ground.mismatches,[]);
    await page.evaluate(()=>aladin.setFoV(0.6));await page.waitForTimeout(400);
    ground=await inspectGround();assert.deepEqual(ground.mismatches,[]);
    await page.evaluate(()=>aladin.setFoV(150));await page.waitForTimeout(400);
    ground=await inspectGround();assert.deepEqual(ground.mismatches,[]);

    for(const altitude of [90,-90]){
      await page.evaluate(alt=>{
        aladin.setFoV(10);
        const frame=SkyHorizon.createFrame(new Date('2026-09-09T16:30:00Z'),19.076,72.8777);
        aladin.gotoRaDec(...SkyHorizon.toEquatorial(frame,0,alt));
      },altitude);
      await page.waitForTimeout(300);
      ground=await inspectGround();assert.deepEqual(ground.mismatches,[]);
      assert.ok(altitude>0 ? ground.below===0 && ground.above>0 : ground.above===0 && ground.below>0);
    }
    assert.deepEqual(await page.evaluate(()=>({
      root:getComputedStyle(document.getElementById('aladin-lite-div')).zIndex,
      controls:getComputedStyle(document.querySelector('.aladin-widgets-toolbar')).zIndex,
      horizon:getComputedStyle(document.getElementById('horizonCanvas')).zIndex
    })),{root:'auto',controls:'4',horizon:'2'});

    // Cardinals must follow projection, not fixed pixel locations; test the
    // actual label draw calls while exercising a mouse drag and another frame.
    await page.evaluate(()=>{
      const ctx=document.getElementById('horizonCanvas').getContext('2d');
      const fillText=ctx.fillText.bind(ctx);
      window.cardinalDraws=[];
      ctx.fillText=(text,x,y)=>{window.cardinalDraws.push({text,x,y});fillText(text,x,y);};
      aladin.setRotation(0);aladin.setFoV(50);
      const frame=SkyHorizon.createFrame(new Date('2026-09-09T16:30:00Z'),19.076,72.8777);
      aladin.gotoRaDec(...SkyHorizon.toEquatorial(frame,90,0));
    });
    await page.waitForTimeout(300);
    const eastBefore=await page.evaluate(()=>window.cardinalDraws.filter(item=>item.text==='E · East').at(-1));
    assert.ok(eastBefore);
    const box=await page.locator('#viewer').boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.mouse.down();await page.mouse.move(box.x+box.width/2+65,box.y+box.height/2,{steps:10});await page.mouse.up();
    await page.waitForTimeout(300);
    const eastAfter=await page.evaluate(()=>window.cardinalDraws.filter(item=>item.text==='E · East').at(-1));
    assert.ok(Math.hypot(eastAfter.x-eastBefore.x,eastAfter.y-eastBefore.y)>20);
    ground=await inspectGround();assert.deepEqual(ground.mismatches,[]);
    await page.evaluate(()=>{aladin.setProjection('AIT');aladin.setFrame('GAL');});
    await page.waitForTimeout(400);
    ground=await inspectGround();assert.deepEqual(ground.mismatches,[]);
    const elapsed=await page.evaluate(()=>{
      const start=performance.now(),frame=SkyHorizon.createFrame(new Date('2026-09-09T16:30:00Z'),19.076,72.8777);
      const viewer=document.getElementById('viewer');
      SkyHorizon.groundPaths(viewer.clientWidth,viewer.clientHeight,(x,y)=>{
        try{const eq=aladin.pix2world(x,y,'ICRS');return Math.sin(SkyHorizon.toHorizontal(frame,...eq).altitude*Math.PI/180);}catch(_){return null;}
      },new Path2D(),new Path2D());
      return performance.now()-start;
    });
    console.log(`Adaptive horizon check: ${elapsed.toFixed(1)} ms at desktop size.`);

    await page.locator('#keepHorizonPointing').uncheck();
    const tracked=await snapshot();await page.locator('#simulationTime').fill('23:00');await page.waitForTimeout(400);
    assert.deepEqual((await snapshot()).raDec,tracked.raDec);
    await page.locator('#showHorizon').uncheck();await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>document.getElementById('horizonCanvas').getContext('2d').getImageData(0,0,1,1).data[3]),0);
    await page.locator('#simulationNow').click();
    assert.equal(await page.locator('#simulationTime').inputValue(),await page.evaluate(()=>SkyHorizon.localFields(new Date()).time));
    assert.deepEqual(errors,[]);
    console.log('PASS: local time/day, main + mosaic FOV, zoom/rotation, fixed horizontal pointing, tracking, ground clipping, cardinal movement during drag, Galactic frame / AIT projection, UI layering, and Now.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
