# opentutorials worklog 

본 액션은 비영리단체 오픈튜토리얼스에서 사용하는 github action입니다. 단체의 목적에 맞게 만들어진 액션이기 때문에 그 외의 용도로 사용하는 것은 공식적으로 지원하지 않습니다. 

# 선행작업

## Airtable
airtable에 계정과 base 그리고 두개의 table이 필요합니다. 테이블의 구조는 아래와 같습니다. 

 - 작업일지
 - 맴버 

아래는 예제입니다. 
https://airtable.com/shrw5AYstzhe7Y29X/tblaQ6Q3BJqiOcb7O/viwzroStZnZZRRXsN?blocks=hide

airtable의 api_key와 base의 식별자를 알아야 합니다. 아래 주소에 방문하시면 찾을 수 있습니다. 
https://airtable.com/api

## Github 
### Secret 값 설정하기
본 Action을 이용하기 위해서는 저장소 설정에서 secret 값을 추가해주셔야 합니다. 
Settings/Secrets/ Add a new secret 

예를들면 서말의 경우 아래 경로로 접근할 수 있습니다. 
https://github.com/opentutorials-org/seomal/settings/secrets

 - AIRTABLE_SECRET
 - AIRTABLE_BASE

### Action 설정하기
Actions 메뉴로 들어가서 Set up a workflow yourself 버튼을 누릅니다. 
main.yml 이라는 이름으로 아래와 같이 설정 파일의 내용을 입력합니다. 

```
name: action-airtable-worklog

on: [push]

jobs:
  build:

    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v2
    - name: submit work log
      id: worklog
      uses: opentutorials-org/action-airtable-worklog@master
      with:
        AIRTABLE_SECRET: ${{ secrets.AIRTABLE_SECRET }} 
        AIRTABLE_BASE: ${{ secrets.AIRTABLE_BASE }} 


```

Start commit 버튼을 누릅니다. 그럼 .github/workflows/main.yml 파일이 만들어집니다. 이 파일은 저장소 내에 포함되어야 합니다. 로컬저장소에서 git pull을 해서 이 파일이 생성되었는지 확인해주세요.

주의:.github/workflows/*.yml 파일이 존재하는 브랜치만 action이 동작합니다.


## Inputs

### `AIRTABLE_SECRET`

**Required** Airtable의 api key 값을 입력해야 합니다..

### `AIRTABLE_BASE`

**Required** Airtable의 base 식별값을 입력해야 합니다.

## Outputs

없습니다. 
