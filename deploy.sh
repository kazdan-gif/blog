#!/bin/bash
set -e

msg="${1:-Update blog}"

git add -A
git commit -m "$msg"
git push origin main

echo "Deployed! Heroku will auto-deploy from main."
