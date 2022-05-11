import os
import sys
import requests
import json
import subprocess
import re


print("current working directory is: ", os.getcwd())
STATUS_FAILED = 'FAILED'
SUCCESS_MESSAGE = 'ok'


def get_github_details():
    github_info_file = open('./.tmp/github.json', 'r')
    return json.load(github_info_file)


def get_commit_details():
    commit_info_file = open('./.tmp/commitDetails.json', 'r')
    return json.load(commit_info_file)


def process_git_local_details():
    # Check if current dir is git dir
    is_git_dir = subprocess.check_output(
        ['/usr/bin/git', 'rev-parse', '--is-inside-work-tree']).decode('utf-8')
    print("Is git dir: ", is_git_dir)

    # git status
    git_status = subprocess.check_output(
        ['/usr/bin/git', 'status']).decode('utf-8')
    print("Git status: ", git_status)

    # last n commits
    last_10_commit_list = subprocess.check_output(
        ['/usr/bin/git', 'rev-list', '--max-count=10', 'HEAD']).decode('utf-8')
    print("last 10 commit ids are: ", last_10_commit_list)

    return {
        'is_git_dir': is_git_dir,
        'last_10_commit_list': last_10_commit_list
    }


def collect_pr_details():
    github = get_github_details()
    commits = get_commit_details()
    git_local = process_git_local_details()
    return {
        'github': github,
        'commits': commits,
        'num_commits_in_pr': len(commits),
        'event_name': github["event_name"],
        'pr_submitter_github_login': github['event']['pull_request']['user']['login'],
        'github_repo': github['repository'],
        'pr_number': github['event']['number'],
        'is_git_dir': git_local['is_git_dir'],
        'last_10_commit_list': git_local['last_10_commit_list'],
    }


def write_comment(comment):
    print(comment)
    f = open("./.tmp/comment", "a")
    f.write(comment)
    f.write("\n")
    f.close()


def task_failed(comment):
    f = open("./.tmp/failed", "a")
    f.write(comment)
    f.write("\n")
    f.close()
    write_comment(comment)
    return STATUS_FAILED


def extract_personal_contributer_details():
    personal_cla_link = sys.argv[1]
    f = requests.get(personal_cla_link)
    personal_cla_contents = f.text

    personal_contributers_regex = re.compile('\| *\[([^\s]+)\]\([^\s]+\) *\|')
    personal_contributers = personal_contributers_regex.findall(
        personal_cla_contents)

    return personal_contributers


def extract_employer_contributer_details():
    employer_cla_link = sys.argv[2]
    f = requests.get(employer_cla_link)
    employer_cla_contents = f.text

    employer_contributers_regex = re.compile('\| *\[([^\s]+)\]\([^\s]+\) *\|')
    employer_contributers = employer_contributers_regex.findall(
        employer_cla_contents)

    return employer_contributers


def validate_is_pull_request(pr_details):
    print('Validate pull request called')
    github_details = pr_details['github']
    if github_details["event_name"] != "pull_request":
        print("Error! This operation is valid on github pull requests. Exiting. Event received: ",
              github_details["event_name"])
        sys.exit(1)


def validate_pr_raiser_cla(pr_raiser_login, employer_contributors, personal_contributors):
    print('PR raiser login: ' + pr_raiser_login)
    if pr_raiser_login not in employer_contributors and pr_raiser_login not in personal_contributors:
        return task_failed('### Error: Contributor Licence Agreement Signature Missing\n' +
                            'Please sign the Contributor Licence Agreement by clicking the following link.\n' +
                            '<p align="center"> <a href="https://phcode-dev.github.io/contributor-license-agreement/">Click here to sign the CLA</a></p>'
                           )
    print('Pass: Pull request raiser has signed the Contributor Licence Agreement')
    return SUCCESS_MESSAGE


def validate_commiters_cla(commits, employer_contributors, personal_contributors):
    # github logins of all committers
    commit_logins = []
    for commit in commits:
        commiter_github_login = commit['author']['login']
        if commiter_github_login not in commit_logins:
            commit_logins.append(commiter_github_login)
    print("All github users who made changes to the pull request: ", commit_logins)

    unauthorized_commiters = []
    for user in commit_logins:
        if user not in personal_contributors and user not in employer_contributors:
            unauthorized_commiters.append(user)
    if len(unauthorized_commiters) != 0:
        return task_failed('### Error: Contributor Licence Agreement Signature Missing\n' +
                            'The following commiter(s) has not signed the Contributor Licence Agreement:\n' + 
                            ', '.join(unauthorized_commiters) + '\n' +
                            'Please sign the Contributor Licence Agreement by clicking the following link. \n' +
                            '<p align="center"> <a href="https://phcode-dev.github.io/contributor-license-agreement/">Click here to sign the CLA</a></p>'
                           )

    print('Pass: All the commiters have signed the Contributor Licence Agreement')
    return SUCCESS_MESSAGE
   

def validate_cla_signature(pr_raiser_login, commits):
    employer_contributors = extract_employer_contributer_details()
    personal_contributors = extract_personal_contributer_details()

    PR_RAISER_CLA_VALIDATION = validate_pr_raiser_cla(pr_raiser_login, employer_contributors, personal_contributors)
    COMMITERS_CLA_VALIDATION = validate_commiters_cla(commits, employer_contributors, personal_contributors)

    if PR_RAISER_CLA_VALIDATION == STATUS_FAILED or COMMITERS_CLA_VALIDATION == STATUS_FAILED:
        return STATUS_FAILED

    return SUCCESS_MESSAGE


def review_pr():
    print('Reviewing PR')
    pr_details = collect_pr_details()
    validate_is_pull_request(pr_details)
    CLA_SIGNATURE_VALIDATION = validate_cla_signature(pr_details['pr_submitter_github_login'], pr_details['commits'])

    if CLA_SIGNATURE_VALIDATION == STATUS_FAILED:
        print('Validations failed. Exiting!')
        return

    write_comment('\n## Thank You for making this pull request.')


review_pr()

# assert validate_cla_signature('psdhanesh7') == SUCCESS_MESSAGE