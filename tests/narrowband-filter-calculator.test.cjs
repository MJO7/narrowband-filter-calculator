const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function loadCalculator() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'narrowband-filter-calculator.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'inline calculator script exists');
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const listeners = new Map();
      let value='';
      elements.set(id, {
        id, get value() { return value; }, set value(next) { value=String(next); },
        textContent:'', innerHTML:'', min:'', max:'', step:'1',
        style:{ display:'', setProperty() {} },
        classList:{ add() {}, remove() {}, toggle() {} },
        appendChild() {},
        addEventListener(event, fn) { listeners.set(event, fn); },
        fire(event) { return listeners.get(event)?.(); },
      });
    }
    return elements.get(id);
  }
  const document = {
    getElementById:element,
    createElement:() => element(`created-${elements.size}`),
    querySelectorAll:() => [],
  };
  const window = { addEventListener() {} };
  vm.runInNewContext(script, {document,window,console,requestAnimationFrame:()=>1,cancelAnimationFrame(){}}, {filename:'narrowband-filter-calculator.html'});
  return {element, calculator:window.NarrowbandCalculator};
}

test('calculator starts with blank optical and filter values', () => {
  const {element,calculator}=loadCalculator();
  assert.equal(element('aperture').value,'');
  assert.equal(element('bandpassCenter').value,'');
  assert.ok(Number.isNaN(calculator.getParams().aperture));
  assert.equal(element('transmission').textContent,'—');
  assert.match(element('tnsCheck').innerHTML,/PASS/);
});

test('CarbonStar presets use published dimensions and reducer factor', () => {
  const {element}=loadCalculator();
  element('opticalPreset').value='carbonstar-native'; element('opticalPreset').fire('change');
  assert.equal(Number(element('aperture').value),150);
  assert.equal(Number(element('focalLength').value),600);
  assert.equal(Number(element('obstructionDiameter').value),62);
  assert.match(element('buyingGuidance').textContent,/f\/4\.0/);
  assert.match(element('buyingGuidance').textContent,/conflicts with Antlia/);
  assert.equal(element('standardRetention').textContent,'82.7%');
  assert.equal(element('highspeedRetention').textContent,'98.6%');
  element('opticalPreset').value='carbonstar-prcc'; element('opticalPreset').fire('change');
  assert.equal(Number(element('focalLength').value),570);
  assert.match(element('buyingGuidance').textContent,/f\/3\.8/);
  assert.equal(element('standardRetention').textContent,'77.4%');
  assert.equal(element('highspeedRetention').textContent,'99.0%');
});

test('Samyang f/2 is not marked supported for either Antlia 3nm filter', () => {
  const {element}=loadCalculator();
  element('opticalPreset').value='samyang-135'; element('opticalPreset').fire('change');
  assert.equal(Number(element('aperture').value),67.5);
  assert.equal(Number(element('focalLength').value),135);
  assert.equal(Number(element('obstructionDiameter').value),0);
  assert.match(element('buyingGuidance').textContent,/does not rate its Highspeed 3 nm below f\/2\.6/);
  assert.match(element('standardRetention').textContent,/%$/);
  assert.match(element('highspeedRetention').textContent,/%$/);
  assert.equal(element('standardRetention').textContent,'25.1%');
  assert.equal(element('highspeedRetention').textContent,'43.6%');
  assert.match(element('standardEstimate').textContent,/% using 88% spec level$/);
  assert.match(element('highspeedEstimate').textContent,/% using 90% listed peak$/);
});

test('Samyang f-stop mode recalculates the entrance pupil and accepts intermediate settings', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'narrowband-filter-calculator.html'), 'utf8');
  const choices = html.match(/<select id="samyangStop">([\s\S]*?)<\/select>/)?.[1];
  assert.ok(choices);
  assert.deepEqual([...choices.matchAll(/<option value="([\d.]+)"/g)].map(match => match[1]),
    ['2','2.4','2.8','3.3','4','4.8','5.6','6.7','8','9.5','11','13','16','22']);
  const {element}=loadCalculator();
  element('opticalPreset').value='samyang-135'; element('opticalPreset').fire('change');
  assert.equal(element('samyangStopRow').style.display,'grid');
  element('samyangStop').value='2.4'; element('samyangStop').fire('change');
  assert.ok(Math.abs(Number(element('aperture').value)-135/2.4)<1e-5);
  assert.equal(element('fRatio').textContent,'—'); // No filter selected yet.
  assert.match(element('opticalNote').textContent,/f\/2\.4/);
  element('samyangStop').value='custom'; element('samyangStop').fire('change');
  assert.equal(element('samyangCustomRow').style.display,'grid');
  assert.equal(element('aperture').value,'');
  element('samyangCustomStop').value='19'; element('samyangCustomStop').fire('input');
  assert.ok(Math.abs(Number(element('aperture').value)-135/19)<1e-5);
  element('samyangCustomStop').value='23'; element('samyangCustomStop').fire('input');
  assert.equal(element('aperture').value,'');
});

test('SHO recommendations evaluate both Antlia filters at every Samyang click, including out-of-range settings', () => {
  const {element,calculator}=loadCalculator();
  const carbonstar=element('carbonstarRecommendations').innerHTML;
  assert.equal((carbonstar.match(/<tr>/g)||[]).length,6);
  assert.match(carbonstar,/Native f\/4<\/td><td>Hα<\/td><td>82\.7%<\/td><td>98\.6%/);
  assert.match(carbonstar,/0\.95× reducer f\/3\.8<\/td><td>Hα<\/td><td>77\.4%<\/td><td>99\.0%/);
  assert.match(element('carbonstarCaution').textContent,/not measured winners/);
  const all=element('samyangAllCombinations').innerHTML;
  assert.equal((all.match(/<tr>/g)||[]).length,42); // 14 f-stops × 3 lines; both filters in each row.
  for (const stop of calculator.samyangStops)
    assert.equal((all.match(new RegExp(`<td>f\\/${stop}<\\/td>`,'g'))||[]).length,3);
  assert.match(all,/f\/2<\/td><td>25\.1%<\/td><td>43\.6%/);
  assert.match(all,/f\/2<\/td><td>25\.1%<\/td><td>43\.6%<\/td><td><strong>Highspeed<\/strong>/);
  assert.match(element('samyangRecommendations').innerHTML,/f\/2<\/td><td>25\.1%<\/td><td>43\.6%<\/td><td><strong>Highspeed<\/strong>/);
  assert.match(element('samyangShoRecommendation').textContent,/f\/2: Hα Highspeed · OIII Highspeed · SII Highspeed/);
  assert.match(element('samyangShoRecommendation').textContent,/does not rate its 3 nm Highspeed filters below f\/2\.6/);
  const html=fs.readFileSync(path.join(__dirname,'..','narrowband-filter-calculator.html'),'utf8');
  assert.doesNotMatch(html,/<th>[^<]*(photon rate|retention)/i);
});

test('recommendation integration matches the full 1000-step model throughout the 84-combination grid', () => {
  const {calculator}=loadCalculator();
  const lines=[{key:'Hα',wavelengths:[656.3]},{key:'OIII',wavelengths:[500.7]},
    {key:'SII',wavelengths:[671.6,673.1]}];
  let largestError=0;
  for (const stop of calculator.samyangStops) {
    const optics={aperture:135/stop,focalLength:135,obstructionDiameter:0};
    for (const line of lines) for (const variant of ['standard','Highspeed']) {
      const group=variant==='standard'?'Antlia 3nm Pro':'Antlia 3nm Pro Highspeed';
      const spec=calculator.presets.find(p=>p.group===group&&p.name.endsWith(`[${line.key}]`)).values;
      const full=line.wavelengths.reduce((sum,wavelength)=>sum+
        calculator.calculateTransmissionContinuous({...spec,...optics,peakTransmittance:1,
          targetWavelength:wavelength,loadedCurveData:null},null,1000)/line.wavelengths.length,0);
      const quick=calculator.shoRetention(optics,line,variant);
      largestError=Math.max(largestError,Math.abs(full-quick));
    }
  }
  assert.ok(largestError<0.0001,`largest fractional error ${largestError}`);
});

test('ZWO camera presets set verified sensor diagonals without guessing Antlia clear aperture', () => {
  const {element}=loadCalculator();
  element('sensorPreset').value='asi533'; element('sensorPreset').fire('change');
  assert.equal(Number(element('sensorDiagonal').value),15.968);
  assert.equal(element('clearAperture').value,'');
  element('sensorPreset').value='asi2600'; element('sensorPreset').fire('change');
  assert.equal(Number(element('sensorDiagonal').value),28.3);
  assert.equal(element('clearAperture').value,'');
  element('sensorDiagonal').value='29'; element('sensorDiagonal').fire('input');
  assert.equal(element('sensorPreset').value,'');
});

test('36mm sizing never treats outside diameter as a guaranteed clear aperture', () => {
  const {element}=loadCalculator();
  element('opticalPreset').value='carbonstar-prcc'; element('opticalPreset').fire('change');
  element('sensorDiagonal').value='23.2'; element('sensorDiagonal').fire('input');
  element('filterDistance').value='10'; element('filterDistance').fire('input');
  assert.match(element('sizeGuidance').textContent,/25\.8 mm/);
  assert.match(element('sizeGuidance').textContent,/unverified/);
  element('clearAperture').value='25'; element('clearAperture').fire('input');
  assert.match(element('sizeGuidance').textContent,/predicts corner vignetting/);
  element('clearAperture').value='30'; element('clearAperture').fire('input');
  assert.match(element('sizeGuidance').textContent,/passes this basic cone check/);
  element('sensorDiagonal').value='36'; element('sensorDiagonal').fire('input');
  assert.match(element('sizeGuidance').textContent,/cannot clear the whole sensor/);
});

test('Gaussian shoulder construction preserves its entered FWHM', () => {
  const {calculator}=loadCalculator();
  const p={aperture:0.001,focalLength:1e9,obstructionDiameter:0,
    bandpassCenter:656.3,fwhm:3,flatTop:1,targetWavelength:656.3,
    peakTransmittance:0.88,effectiveRefractiveIndex:1.8,loadedCurveData:null};
  const center=calculator.calculateTransmissionContinuous(p);
  const half=calculator.calculateTransmissionContinuous({...p,targetWavelength:657.8});
  assert.ok(Math.abs(center-0.88)<1e-8);
  assert.ok(Math.abs(half-0.44)<0.0001);
});

test('measured percentage curves scale every row and switching to a preset clears the curve', async () => {
  const {element,calculator}=loadCalculator();
  element('curveFile').files=[{name:'curve.csv',text:async()=> '655,1\n656,90\n657,1\n'}];
  await element('curveFile').fire('change');
  assert.equal(calculator.getParams().loadedCurveData[0].transmission,0.01);
  assert.equal(calculator.getParams().loadedCurveData[1].transmission,0.9);
  element('preset').value='3';
  element('preset').fire('change');
  assert.equal(calculator.getParams().loadedCurveData,null);
  assert.equal(Number(element('bandpassCenter').value),656.3);
});
