import {spawn} from 'node:child_process';
import {setTimeout} from 'node:timers/promises';
const port=process.env.E2E_PORT??'3110';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',port],{stdio:'inherit'});
const env={...process.env,E2E_BASE_URL:`http://127.0.0.1:${port}`};
try{
 let ready=false;
 for(let attempt=0;attempt<60;attempt++){
  if(server.exitCode!==null)throw new Error('App exited before E2E');
  try{const response=await fetch(env.E2E_BASE_URL);if(response.ok){ready=true;break;}}catch{}
  await setTimeout(500);
 }
 if(!ready)throw new Error('App readiness timeout');
 for(const script of ['e2e/demo.mjs','e2e/onboarding.mjs']){
  const child=spawn(process.execPath,[script],{stdio:'inherit',env});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  if(code!==0)throw new Error(`${script} failed with ${code}`);
 }
}finally{server.kill('SIGTERM');}
