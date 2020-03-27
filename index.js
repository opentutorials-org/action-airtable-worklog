const core = require('@actions/core');
const github = require('@actions/github');
const https = require('https');
var Airtable = require('airtable');
const {
  spawn
} = require('child_process');
const moment = require('moment');

console.log(`
# 소개
커밋을 업무일지로 자동으로 등록해주는 스크립트입니다. 

github secret에 아래의 환경변수를 등록해야 합니다. 
 + AIRTABLE_SECRET
 + AIRTABLE_BASE

# 개발
 개발환경에서 실행할 때는 아래의 형식을 통해서 실행할 수 있습니다. 
AIRTABLE_SECRET=*** GITHUB_REPOSITORY=opentutorials-org/work GITHUB_SHA=현재계정의커밋아이디 GITHUB_ACTOR=egoing AIRTABLE_BASE=appF3xUxbkNlKCJiL node index.js

`)

if(
//   !process.env.AIRTABLE_SECRET ||
//   !process.env.AIRTABLE_BASE ||
  !process.env.GITHUB_REPOSITORY ||
  !process.env.GITHUB_SHA ||
  !process.env.GITHUB_ACTOR
) {
  console.error(` 
환경변수가 누락 되었습니다. 개발환경이라면 아래와 같은 방법으로 실행시킬 수 있습니다. 필요한 환경변수는 아래와 같습니다. 
AIRTABLE_SECRET ,AIRTABLE_BASE ,GITHUB_REPOSITORY ,GITHUB_SHA ,GITHUB_ACTOR
  `);
  process.exit();
}

const airtable_secret = process.env.AIRTABLE_SECRET || core.getInput('AIRTABLE_SECRET');
const airtable_base = process.env.AIRTABLE_BASE || core.getInput('AIRTABLE_BASE');
const github_repository = process.env.GITHUB_REPOSITORY;
const github_commit_id = process.env.GITHUB_SHA;
const github_actor = process.env.GITHUB_ACTOR;

console.log('process.env.AIRTABLE_SECRET', process.env.AIRTABLE_SECRET, airtable_secret, 'process.env.AIRTABLE_BASE', process.env.AIRTABLE_BASE, airtable_base);

console.log(`
AIRTABLE_SECRET=${airtable_secret.substr(0,2)+'..'+airtable_secret.substr(-2)} GITHUB_REPOSITORY=${github_repository} GITHUB_SHA=${github_commit_id} GITHUB_ACTOR=${github_actor} AIRTABLE_BASE=${airtable_base} node index.js
`)

var base = new Airtable({
  apiKey: airtable_secret
}).base(airtable_base);

// getGithubId('egoing', (data)=>{console.log('result', data);});
function getGithubId(githubid, cb) {
  base('맴버').select({
    view: "Grid view"
  }).eachPage(function page(records, fetchNextPage) {
    records.forEach(function (record) {
      if (record.get('githubid') === githubid) {
        cb({
          id: record.id,
          name: record.get('Name')
        });
      }
    });
    fetchNextPage();
  }, function done(err) {
    if (err) {
      console.error(err);
      return;
    }
  });
}

function create(actor_id, commit_msg, consume_time, typeId) {
  var commit_url = `http://github.com/${github_repository}/commit/${github_commit_id}`;
  var commits = commit_msg.split('\n');
  var commit_only_message = commits.splice(4).join('\n').trim().substr(0, 100);
  var data = {
    "fields": {
      "이름": [
        `${actor_id}`
      ],
      "근거자료 (텍스트)": commit_url,
      "작업시간 (시간)": consume_time,
      "업무명": commit_only_message,
      "업무내용": commit_msg,
      "작업일": moment().format('YYYY-MM-DD'),
      "업무종류": [typeId]
    }
  }
  console.log('data', data);
  base('작업일지').create([data], function (err, records) {
    if (err) {
      console.error(err);
      return;
    }
    records.forEach(function (record) {
      console.info('created', record.getId());
    });
  });
}

function getCommitMessage(commit_id, cb) {
  console.log(`git log ${commit_id} -1`);
  const log = spawn('git', ['log', commit_id, '-1']);
  log.stdout.on('data', (data) => {
    cb(data.toString());
  });
  log.stderr.on('data', (data) => {
    console.error(`getCommitMessage error`, data.toString());
    // cb(data.toString());
  });
  log.on('close', (data) => {
    console.info(`getCommitMessage close`, data);
    // cb(data.toString());
  });
}

function getConsumeTimeFromCommitMessage(commit_msg) {
  var regexp = /(?:[1-9]\d{0,2}(?:,\d{3})*|0)(?:\.\d+)?h$/;
  var match = commit_msg.trim().match(regexp);
  if (match) {
    return match[0].replace('h', '');
  }
  return '0';
}

async function getAirtableTypeId(name='이메일') {
  return new Promise(function(resolve, reject){
    const options = {
      headers: {
        Authorization: `Bearer ${airtable_secret}`
      },
      method: 'GET'
    };
    const URL = `https://api.airtable.com/v0/${airtable_base}/%EC%97%85%EB%AC%B4%EC%A2%85%EB%A5%98?maxRecords=1000&view=Grid%20view`;
    const req = https.get(URL, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      })
      res.on('end', () => {
        var records = JSON.parse(data).records;
        console.log('URL', URL);
        console.log("getAirtableEmailTypeId -> records", records, data);
        for (var i = 0; i < records.length; i++) {
          if(records[i].fields.Name === name){
            resolve(records[i].id);
            return true;
          }
        }
      })
    });
    req.on('error', (e)=>{
      console.log("getAirtableEmailTypeId error ", e);
    })
    req.end();
  })
  reject('업무타임의 아이디값을 구할 수 없습니다.');
}

 getCommitMessage(github_commit_id, commit_msg => {
  console.log('commit_msg', commit_msg);
  var consume_time = getConsumeTimeFromCommitMessage(commit_msg);
  console.log('consume time', consume_time);
  getGithubId(github_actor, async data => {
    console.log('actor', data);
    const payload = JSON.stringify(github.context.payload, undefined, 2)
    console.log(`The event payload: ${payload}`);
    const typeId = await getAirtableTypeId('커밋');
    console.log('typeid', typeId);
    create(data.id, commit_msg, consume_time, typeId);
  });
});
