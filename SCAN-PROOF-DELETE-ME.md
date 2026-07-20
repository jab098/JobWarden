# Deliberate test secret — Task 28

This branch exists only to prove the `verify` workflow's secret scan catches a
secret rather than merely running. The value below is a fictional Slack bot
token in the right shape for the `slack-bot-token` gitleaks rule. It has never
been a real credential and grants access to nothing.

Delete this branch once the scan has failed on it.

    slack_bot_token = "xoxb-000000000000-000000000000-abcdefghijklmnopqrstuvwx"
