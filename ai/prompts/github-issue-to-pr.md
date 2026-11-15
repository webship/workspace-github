Work one GitHub issue of a project to a pull request the Webship way, with the Checkpoints list.

```
claude --permission-mode bypassPermissions """
Work issue <number> of the GitHub repository of the project <project> to a pull request
# ~/workspace/<folder>/<project> · container-based (DDEV by default) · gh and git run on the machine
# stop if gh is not signed in (gh auth status) or the remote of the project is not on GitHub
# never print a token; never tick "Reviewed by a human" or "Code review by maintainers"; never merge

1. cd ~/workspace/<folder>/<project> ; git status --short ; git remote get-url origin
   stop if there are changes that are not yours
2. gh issue view <number> --json number,title,state,body,comments
   tell me in three lines what the issue asks for and what you will change, then go on
3. git fetch origin ; git switch -c <fix|feat|docs>/<number>-<short-name> origin/<base>
4. make the change, and run the tests the project has
   if ../cmd-tools-testing.sh and cucumber.js are both there, also run from the folder above:
   bash cmd-tools-testing.sh <project> --run
   and keep the totals it prints; if they are not there, say so and do not invent a test run
5. commit as the person git config names here: <type>: #<number> <what changed>
6. git push -u origin <the branch> ; gh pr create --head <the branch> --title "<the commit subject>" --body-file <file>
   the body: Closes #<number>, what changed, how it was tested with the real numbers,
   AI-Generated: Yes, and the Checkpoints list as the last section, ticked only for what is done
7. gh pr checks <the pull request> --watch
   a red check: gh run view <run id> --log-failed, fix, push, watch again

When the checks are green: the address of the pull request, what was tested, and which Checkpoints
are still open. Leave the merge to me.
"""
```

The text between the triple quotes is plain: it can be given to another AI command-line assistant as it is.
