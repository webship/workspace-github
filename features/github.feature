Feature: The GitHub plugin on a project row
  Once the plugin is activated and installed, every project whose git remote is on GitHub carries
  the GITHUB menu, and the Plugins page lists the plugin with its four steps.

  # The Plugins page names each plugin; the package is on the plugin's own page (the row shows it on hover only).
  Scenario: The plugin is listed on the Plugins page, and its own page names its package
    Given I am on "/settings/plugins"
     Then I should see "GitHub"
     When I go to "/settings/plugin/github"
     Then I should see "@webship.co/workspace-github"

  # The AI folders are searched by name: with every plugin on, a folder lists more than one page of items.
  Scenario: The AI Agents folder lists the agent the plugin ships
    Given I am on "/ai-agents?q=github-issue-pr-worker"
     Then I should see "github-issue-pr-worker"

  Scenario: The AI Skills folder lists the skill the plugin ships
    Given I am on "/ai-skills?q=github-forge"
     Then I should see "github-forge"

  Scenario: The AI Commands folder lists the command the plugin ships
    Given I am on "/ai-commands?q=github-status"
     Then I should see "github-status"

  Scenario: The AI Prompts folder lists the prompt the plugin ships
    Given I am on "/ai-prompts?q=github-issue-to-pr"
     Then I should see "github-issue-to-pr"
