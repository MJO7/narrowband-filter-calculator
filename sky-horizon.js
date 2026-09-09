/* Additional observer/time layer for Aladin Lite. No replacement sky projection.
 * Coordinates: Astronomy Engine EQJ (J2000) ↔ HOR (north, west, zenith).
 * References and accuracy limits: docs/sky-time-horizon.md.
 */
(function(root, factory){
  if(typeof module === 'object' && module.exports){
    module.exports = factory(require('./vendor/astronomy-2.1.19.min.js'));
  }else{
    root.SkyHorizon = factory(root.Astronomy);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Astronomy){
  'use strict';
  const RAD = Math.PI / 180;
  const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const xyz = (ra,dec) => [Math.cos(dec*RAD)*Math.cos(ra*RAD), Math.cos(dec*RAD)*Math.sin(ra*RAD), Math.sin(dec*RAD)];
  const radec = v => [(Math.atan2(v[1],v[0])/RAD+360)%360, Math.atan2(v[2],Math.hypot(v[0],v[1]))/RAD];
  const validPair = p => p && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  const pad = n => String(n).padStart(2,'0');

  function createFrame(date, latitude, longitude){
    if(!Number.isFinite(date.getTime()) || !Number.isFinite(latitude) || Math.abs(latitude)>90 || !Number.isFinite(longitude) || Math.abs(longitude)>180){
      throw new RangeError('Invalid time or observer coordinates');
    }
    const time = Astronomy.MakeTime(date);
    const observer = new Astronomy.Observer(latitude, longitude, 0);
    const rotation = Astronomy.Rotation_HOR_EQJ(time, observer);
    const axis = (x,y,z) => {
      const v = Astronomy.RotateVector(rotation, new Astronomy.Vector(x,y,z,time));
      return [v.x,v.y,v.z];
    };
    return {north:axis(1,0,0), west:axis(0,1,0), up:axis(0,0,1)};
  }

  function toHorizontal(frame, ra, dec){
    const v = xyz(ra,dec);
    const north = dot(v,frame.north), east = -dot(v,frame.west), up = dot(v,frame.up);
    return {azimuth:(Math.atan2(east,north)/RAD+360)%360, altitude:Math.atan2(up,Math.hypot(north,east))/RAD};
  }

  function toEquatorial(frame, azimuth, altitude){
    const n = Math.cos(altitude*RAD)*Math.cos(azimuth*RAD);
    const w = -Math.cos(altitude*RAD)*Math.sin(azimuth*RAD);
    const u = Math.sin(altitude*RAD);
    return radec(frame.north.map((v,i) => n*v + w*frame.west[i] + u*frame.up[i]));
  }

  function localFields(date){
    return {date:`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`, time:`${pad(date.getHours())}:${pad(date.getMinutes())}`};
  }

  // Parse as local civil time, never as a UTC date-only string. Reject DST gaps
  // instead of silently normalizing them. Return both occurrences of a DST fold.
  function parseLocalTime(dateText, timeText){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !/^\d{2}:\d{2}$/.test(timeText)) return [];
    const [y,m,d] = dateText.split('-').map(Number), [h,min] = timeText.split(':').map(Number);
    if(y<1900 || y>2100 || m<1 || m>12 || d<1 || d>31 || h>23 || min>59) return [];
    const first = new Date(y,m-1,d,h,min,0,0);
    const matches = date => {
      const fields = localFields(date);
      return fields.date === dateText && fields.time === timeText;
    };
    if(!matches(first)) return [];
    const result = [first];
    // Modern civil-time folds include 30, 60, 120 and occasionally 180 minutes.
    for(let minutes=1; minutes<=180; minutes++){
      const candidate = new Date(first.getTime()+minutes*60000);
      if(matches(candidate)) result.push(candidate);
    }
    return result;
  }

  function utcOffset(date){
    const offset = -date.getTimezoneOffset();
    return `UTC${offset>=0?'+':'−'}${pad(Math.floor(Math.abs(offset)/60))}:${pad(Math.abs(offset)%60)}`;
  }

  // Adaptively clip each visible screen cell against sin(altitude)=0.
  // Every sample uses Aladin's inverse projection, in explicit ICRS coordinates.
  // This also handles an entirely underground view, horizon curves, projection
  // seams, arbitrary view rotation and tiny FOVs without guessing a screen line.
  function groundPaths(width, height, sample, ground, edge){
    function triangle(points){
      if(points.some(p => p[2] === null)) return;
      const clipped=[], crossings=[];
      for(let i=0;i<3;i++){
        const a=points[i], b=points[(i+1)%3];
        if(a[2]<0) clipped.push(a);
        if((a[2]<0)!==(b[2]<0)){
          const t=a[2]/(a[2]-b[2]);
          const p=[a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])];
          clipped.push(p); crossings.push(p);
        }
      }
      if(clipped.length>=3){
        ground.moveTo(clipped[0][0],clipped[0][1]);
        clipped.slice(1).forEach(p => ground.lineTo(p[0],p[1]));
        ground.closePath();
      }
      if(crossings.length===2){
        edge.moveTo(...crossings[0]); edge.lineTo(...crossings[1]);
      }
    }
    const cache = new Map();
    function point(x,y){
      const key = `${x},${y}`;
      if(!cache.has(key)) cache.set(key,[x,y,sample(x,y)]);
      return cache.get(key);
    }
    function cell(x,y,w,h){
      const a=point(x,y), b=point(x+w,y), c=point(x+w,y+h), d=point(x,y+h);
      const center=point(x+w/2,y+h/2);
      const samples=[a,b,c,d,center];
      if(samples.every(p=>p[2]===null)) return;
      if(samples.every(p=>p[2]!==null && p[2]>=0)) return;
      if(samples.every(p=>p[2]!==null && p[2]<0)){
        ground.rect(x,y,w,h); return;
      }
      if(w<=1 && h<=1){
        triangle([a,b,center]); triangle([b,c,center]);
        triangle([c,d,center]); triangle([d,a,center]);
      }else{
        cell(x,y,w/2,h/2); cell(x+w/2,y,w/2,h/2);
        cell(x,y+h/2,w/2,h/2); cell(x+w/2,y+h/2,w/2,h/2);
      }
    }
    for(let y=0;y<height;y+=64){
      for(let x=0;x<width;x+=64) cell(x,y,Math.min(64,width-x),Math.min(64,height-y));
    }
  }

  function attach(aladin, {onViewChange=()=>{}} = {}){
    if(!Astronomy || !Astronomy.Rotation_HOR_EQJ) throw new Error('Astronomy Engine did not load');
    const $ = id => document.getElementById(id);
    const canvas=$('horizonCanvas'), viewer=$('viewer'), ctx=canvas.getContext('2d');
    let date=new Date(), frame=null, observer=null, pending=false;
    let lastKey='', candidates=[], timeValid=true;
    date.setSeconds(0,0);

    function refreshClock(){
      const fields=localFields(date);
      $('simulationDate').value=fields.date;
      $('simulationTime').value=fields.time;
      $('simulationWeekday').textContent=date.toLocaleDateString(undefined,{weekday:'long'});
      $('simulationZone').textContent=`Device timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone} · ${utcOffset(date)}`;
      candidates=parseLocalTime(fields.date,fields.time);
      $('timeOccurrenceRow').hidden=candidates.length<2;
      $('timeOccurrence').replaceChildren(...candidates.map((item,index)=>{
        const option=document.createElement('option');
        option.value=String(index); option.textContent=`${index===0?'First':'Second'} · ${utcOffset(item)}`;
        return option;
      }));
      $('timeOccurrence').value=String(Math.max(0,candidates.findIndex(item=>+item===+date)));
      $('simulationStatus').textContent=observer ? 'Selected time · change the date or minute to update the sky.' : 'Selected time · set your observing location to update the local sky.';
    }

    function setDate(next){
      let pointing=null;
      if(frame && $('keepHorizonPointing').checked){
        const center=aladin.getRaDec();
        if(validPair(center)) pointing=toHorizontal(frame,...center);
      }
      date=next;
      timeValid=true;
      if(observer) frame=createFrame(date,...observer);
      refreshClock();
      if(pointing){
        // Only change pointing after an explicit time edit. All existing zoom,
        // projection, survey, position angle and FOV controls remain untouched.
        aladin.gotoRaDec(...toEquatorial(frame,pointing.azimuth,pointing.altitude));
        onViewChange();
      }
      schedule();
    }

    function readTime(){
      const options=parseLocalTime($('simulationDate').value,$('simulationTime').value);
      if(!options.length){
        timeValid=false;
        $('simulationWeekday').textContent='—';
        $('timeOccurrenceRow').hidden=true;
        $('simulationStatus').textContent='Enter a valid local date and time (1900–2100). A skipped daylight-saving time is not valid. The sky still shows the last valid time.';
        return;
      }
      setDate(options[0]);
    }

    function setObserver(latitude,longitude){
      const next=createFrame(date,latitude,longitude);
      observer=[latitude,longitude]; frame=next;
      $('observerLatitude').value=String(latitude);
      $('observerLongitude').value=String(longitude);
      $('locationStatus').textContent=`Lat ${latitude.toFixed(4)}°, Lon ${longitude.toFixed(4)}°`;
      if(timeValid) refreshClock();
      schedule();
    }

    function sample(x,y){
      try{
        const p=aladin.pix2world(x,y,'ICRS');
        return validPair(p) ? dot(xyz(...p),frame.up) : null;
      }catch(_){ return null; }
    }

    function project(az,alt){
      try{
        const coordinates=toEquatorial(frame,az,alt);
        // world2pix defaults to ICRS. Aladin's current hosted release throws
        // when its optional string-frame argument is supplied; omit it here.
        const p=aladin.world2pix(...coordinates);
        if(!validPair(p)) return null;
        // Reject back-side/ambiguous projected points via a round trip.
        const back=aladin.pix2world(...p,'ICRS');
        if(!validPair(back) || dot(xyz(...coordinates),xyz(...back))<0.999999) return null;
        return p;
      }catch(_){ return null; }
    }

    function draw(){
      pending=false;
      const width=viewer.clientWidth, height=viewer.clientHeight;
      if(!width || !height) return;
      const dpr=Math.min(window.devicePixelRatio||1,2);
      if(canvas.width!==Math.round(width*dpr) || canvas.height!==Math.round(height*dpr)){
        canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
      }
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,width,height);
      const stamp=`${date.toLocaleDateString(undefined,{weekday:'short',year:'numeric',month:'short',day:'numeric'})} · ${localFields(date).time} ${utcOffset(date)}`;
      if(!frame){
        $('skyTimeBadge').textContent=`${stamp} · Location needed`;
        return;
      }
      const center=aladin.getRaDec();
      const horizontal=toHorizontal(frame,...center);
      const status=`Center: altitude ${horizontal.altitude.toFixed(2)}° · azimuth ${horizontal.azimuth.toFixed(2)}°`;
      $('horizonStatus').textContent=`${status}. ${horizontal.altitude<0?'Below the horizon.':'Above the horizon.'}`;
      $('skyTimeBadge').textContent=`${stamp} · Alt ${horizontal.altitude.toFixed(1)}° · Az ${horizontal.azimuth.toFixed(1)}°${$('showHorizon').checked?'':' · Ground hidden'}`;
      if(!$('showHorizon').checked) return;

      const ground=new Path2D(), edge=new Path2D();
      groundPaths(width,height,sample,ground,edge);
      // Opaque, muted ground hides the survey AND constellation objects.
      // Instrument rectangles remain above this layer for framing below 0°.
      ctx.fillStyle='#192724'; ctx.fill(ground);
      ctx.strokeStyle='#92b3a3'; ctx.lineWidth=1.2; ctx.stroke(edge);

      for(const [label,az] of [['N · North',0],['E · East',90],['S · South',180],['W · West',270]]){
        const p=project(az,0);
        if(!p || p[0]<0 || p[0]>width || p[1]<0 || p[1]>height) continue;
        ctx.fillStyle='#e8f5e8'; ctx.beginPath(); ctx.arc(p[0],p[1],3,0,2*Math.PI); ctx.fill();
        // Offset the text a few pixels toward the local zenith. The anchor
        // itself is always exactly on the projected cardinal's 0° altitude.
        const above=project(az,0.05);
        const dx=above?above[0]-p[0]:0, dy=above?above[1]-p[1]:-1, len=Math.hypot(dx,dy)||1;
        const x=p[0]+16*dx/len, y=p[1]+16*dy/len;
        ctx.font='600 14px system-ui, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.strokeStyle='#0b1514'; ctx.lineWidth=4; ctx.strokeText(label,x,y); ctx.fillText(label,x,y);
      }
    }

    function schedule(){
      if(pending) return;
      pending=true; requestAnimationFrame(draw);
    }

    $('simulationDate').addEventListener('input',readTime);
    $('simulationTime').addEventListener('input',readTime);
    $('timeOccurrence').addEventListener('change',()=>{
      const next=candidates[Number($('timeOccurrence').value)];
      if(next) setDate(next);
    });
    $('simulationNow').addEventListener('click',()=>{
      const now=new Date(); now.setSeconds(0,0); setDate(now);
    });
    $('showHorizon').addEventListener('change',schedule);
    $('applyObserver').addEventListener('click',()=>{
      const lat=$('observerLatitude'), lon=$('observerLongitude');
      if(!lat.value || !lon.value || !lat.checkValidity() || !lon.checkValidity()){
        $('horizonStatus').textContent='Enter latitude from −90° to 90° and longitude from −180° to 180°.';
        return;
      }
      setObserver(Number(lat.value),Number(lon.value));
    });
    for(const event of ['positionChanged','zoomChanged','rotationChanged','projectionChanged','cooFrameChanged','resizeChanged']){
      aladin.on(event,schedule);
    }
    new ResizeObserver(schedule).observe(viewer);
    // A fallback also catches view changes in older Aladin versions. Unchanged
    // views do not redraw; gesture events are coalesced into animation frames.
    setInterval(()=>{
      const key=JSON.stringify([aladin.getRaDec(),aladin.getFoV(),aladin.getRotation?.()]);
      if(key!==lastKey){lastKey=key;schedule();}
    },250);
    refreshClock(); schedule();
    return {setObserver,zenith:()=>frame?toEquatorial(frame,0,90):null};
  }
  return {createFrame,toHorizontal,toEquatorial,parseLocalTime,localFields,utcOffset,groundPaths,attach};
});
