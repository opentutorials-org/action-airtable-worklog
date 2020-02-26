const core = require('@actions/core');
const github = require('@actions/github');
var Airtable = require('airtable');
const {
  spawn
} = require('child_process');
const moment = require('moment');

console.log(`
# 소개
커밋을 업무일지로 자동으로 등록해주는 스크립트입니다. 

# 설치
저장소내에 아래의 위치에 파일을 배치해야 합니다. 
 - .github/scripts/work.js
 - .github/workflows/work.yml

github secret에 아래의 환경변수를 등록해야 합니다. 
 - AIRTABLE_SECRET
 - AIRTABLE_BASE

# 개발
 개발환경에서 실행할 때는 아래의 형식을 통해서 실행할 수 있습니다. 
AIRTABLE_SECRET=*** GITHUB_REPOSITORY=opentutorials-org/work GITHUB_SHA=현재계정의커밋아이디 GITHUB_ACTOR=egoing AIRTABLE_BASE=appF3xUxbkNlKCJiL node work.js
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

function create(actor_id, commit_msg, consume_time) {
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
      "작업일": moment().format('YYYY-MM-DD')
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
  const ls = spawn('git', ['log', commit_id, '-1']);
  ls.stdout.on('data', (data) => {
    cb(data.toString());
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

getCommitMessage(github_commit_id, commit_msg => {
  console.log('commit_msg', commit_msg);
  var consume_time = getConsumeTimeFromCommitMessage(commit_msg);
  console.log('consume time', consume_time);
  getGithubId(github_actor, data => {
    console.log('actor', data);
    const payload = JSON.stringify(github.context.payload, undefined, 2)
    console.log(`The event payload: ${payload}`);
    create(data.id, commit_msg, consume_time);
  });
});