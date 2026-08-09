import {museTalkPreflight} from '../avatar-service/backends/musetalk.mjs';
const result=museTalkPreflight();
console.log(JSON.stringify(result,null,2));
process.exit(result.ok?0:2);
