const core = require("@actions/core");
const github = require("@actions/github");
const https = require("https");
var Airtable = require("airtable");
const { spawn } = require("child_process");
const moment = require("moment");

const DEFAULT_CONSUME_TIME = 0.05;

console.log(`
# 소개
커밋/이슈/커멘트를 업무일지로 자동으로 등록해주는 스크립트입니다.
`);

if (
    !process.env.GITHUB_REPOSITORY ||
    !process.env.GITHUB_SHA ||
    !process.env.GITHUB_ACTOR
) {
    console.error(` 
환경변수가 누락 되었습니다. 필요한 환경변수: AIRTABLE_SECRET, AIRTABLE_BASE, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_ACTOR
  `);
    process.exit();
}

const airtable_secret =
    process.env.AIRTABLE_SECRET || core.getInput("AIRTABLE_SECRET");
const airtable_base =
    process.env.AIRTABLE_BASE || core.getInput("AIRTABLE_BASE");
const github_repository = process.env.GITHUB_REPOSITORY;
const github_commit_id = process.env.GITHUB_SHA;
const github_actor = process.env.GITHUB_ACTOR;
const eventName = github.context.eventName;
const payload = github.context.payload;

console.log(`
AIRTABLE_SECRET=${
    airtable_secret.substr(0, 2) + ".." + airtable_secret.substr(-2)
} 
GITHUB_REPOSITORY=${github_repository} 
GITHUB_SHA=${github_commit_id} 
GITHUB_ACTOR=${github_actor} 
AIRTABLE_BASE=${airtable_base}
EVENT=${eventName}
`);

var base = new Airtable({
    apiKey: airtable_secret,
}).base(airtable_base);

function getGithubId(githubid, cb) {
    base("맴버")
        .select({
            view: "Grid view",
        })
        .eachPage(
            function page(records, fetchNextPage) {
                records.forEach(function (record) {
                    if (record.get("githubid") === githubid) {
                        cb({
                            id: record.id,
                            name: record.get("Name"),
                        });
                    }
                });
                fetchNextPage();
            },
            function done(err) {
                if (err) {
                    console.error(err);
                    return;
                }
            }
        );
}

function create(actor_id, commit_msg, consume_time, Id) {
    var commit_url = `http://github.com/${github_repository}/commit/${github_commit_id}`;
    var commits = commit_msg.split("\n");
    var commit_only_message = commits
        .splice(4)
        .join("\n")
        .trim()
        .substr(0, 200);
    var data = {
        fields: {
            이름: [`${actor_id}`],
            "근거자료 (텍스트)": commit_url,
            "작업시간 (시간)": consume_time,
            업무명: commit_only_message,
            업무내용: commit_msg,
            작업일: moment().format("YYYY-MM-DD"),
            업무종류: [Id],
        },
    };
    console.log("data", data);
    base("작업일지").create([data], function (err, records) {
        if (err) {
            console.error(err);
            return;
        }
        records.forEach(function (record) {
            console.info("created", record.getId());
        });
    });
}

function createForIssue(
    actor_id,
    issue_title,
    issue_body,
    issue_url,
    consume_time,
    Id
) {
    var data = {
        fields: {
            이름: [`${actor_id}`],
            "근거자료 (텍스트)": issue_url,
            "작업시간 (시간)": consume_time,
            업무명: issue_title,
            업무내용: issue_body,
            작업일: moment().format("YYYY-MM-DD"),
            업무종류: [Id],
        },
    };
    console.log("issue data", data);
    base("작업일지").create([data], function (err, records) {
        if (err) {
            console.error(err);
            return;
        }
        records.forEach(function (record) {
            console.info("created issue", record.getId());
        });
    });
}

function getCommitMessage(commit_id, cb) {
    console.log(`git log ${commit_id} -1`);
    const log = spawn("git", ["log", commit_id, "-1"]);
    let logData = "";
    log.stdout.on("data", (data) => {
        logData += data.toString();
    });
    log.stderr.on("data", (data) => {
        console.error(`getCommitMessage error`, data.toString());
    });
    log.on("close", (code) => {
        cb(logData);
    });
}

function getConsumeTimeFromMessage(msg) {
    var regexp = /(?:[1-9]\d{0,2}(?:,\d{3})*|0)(?:\.\d+)?h$/;
    var match = msg.trim().match(regexp);
    if (match) {
        return match[0].replace("h", "");
    }
    return "0";
}

async function getAirtableId(name = "이메일") {
    return new Promise(function (resolve, reject) {
        const options = {
            headers: {
                Authorization: `Bearer ${airtable_secret}`,
            },
            method: "GET",
        };
        const URL = `https://api.airtable.com/v0/${airtable_base}/%EC%97%85%EB%AC%B4%EC%A2%85%EB%A5%98?maxRecords=1000&view=Grid%20view`;
        const req = https.get(URL, options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                var records = JSON.parse(data).records;
                for (var i = 0; i < records.length; i++) {
                    if (records[i].fields.Name === name) {
                        resolve(records[i].id);
                        return;
                    }
                }
                reject("업무종류 아이디를 찾을 수 없습니다.");
            });
        });
        req.on("error", (e) => {
            console.log("getAirtableId error ", e);
            reject(e);
        });
        req.end();
    });
}

// 이벤트 처리 로직
if (eventName === "push") {
    // push 이벤트 처리
    getCommitMessage(github_commit_id, (commit_msg) => {
        console.log("commit_msg", commit_msg);
        let consume_time = Number(getConsumeTimeFromMessage(commit_msg));
        if (consume_time === 0) {
            consume_time = DEFAULT_CONSUME_TIME;
        }
        console.log("consume time", consume_time);
        if (consume_time > 0) {
            getGithubId(github_actor, async (data) => {
                console.log("actor", data);
                const Id = await getAirtableId("커밋");
                create(data.id, commit_msg, consume_time, Id);
            });
        }
    });
} else if (eventName === "issues") {
    // issue 이벤트 처리
    if (payload.issue) {
        getGithubId(github_actor, async (data) => {
            console.log("actor", data);
            const Id = await getAirtableId("이슈");
            const ISSUE_TITLE = (payload.issue.title || "") + " 이슈 발행";
            const ISSUE_BODY = payload.issue.body || "";
            const ISSUE_URL = payload.issue.html_url || "";
            let consume_time = Number(getConsumeTimeFromMessage(ISSUE_BODY));
            if (consume_time === 0) {
                consume_time = DEFAULT_CONSUME_TIME;
            }
            if (consume_time > 0) {
                createForIssue(
                    data.id,
                    ISSUE_TITLE,
                    ISSUE_BODY,
                    ISSUE_URL,
                    consume_time,
                    Id
                );
            }
        });
    }
} else if (eventName === "issue_comment") {
    // issue_comment 이벤트 처리
    if (payload.issue && payload.comment) {
        getGithubId(github_actor, async (data) => {
            console.log("actor", data);
            const Id = await getAirtableId("이슈댓글");
            const ISSUE_TITLE = payload.issue.title || "";
            const COMMENT_BODY = (payload.comment.body || "") + " 댓글 추가";
            const COMMENT_URL = payload.comment.html_url || ""; // 변경된 부분
            let consume_time = Number(getConsumeTimeFromMessage(COMMENT_BODY));
            if (consume_time === 0) {
                consume_time = DEFAULT_CONSUME_TIME;
            }
            if (consume_time > 0) {
                createForIssue(
                    data.id,
                    ISSUE_TITLE,
                    COMMENT_BODY,
                    COMMENT_URL, // 변경된 부분
                    consume_time,
                    Id
                );
            }
        });
    }
} else {
    console.log(`지원하지 않는 이벤트 타입: ${eventName}`);
    process.exit(0);
}
