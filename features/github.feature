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

  # The issues as work items (@webship.co/workspace-tracker): their settings are labelled on the plugin's page.
  Scenario: The plugin's page labels the tracker settings, with writes off
    Given I am on "/settings/plugin/github"
     Then I should see "Writes to GitHub (issues as work items)"

  # The issues list asks GitHub again when its View or its filter changes, and Enter submits it. It needs issues to
  # read: a project of the dev folder whose remote is on GitHub, and tracker.default_scope set. CI has neither, so it
  # skips this and says why; with them it is a real test.
  @needs-setting-github-default_scope @needs-project-dev
  Scenario: The issues list follows its View and its filter
    Given I am on "/dev"
     When I click on the element ".act-menu-github > button"
      And I click on the element ".act-menu-github a[hx-get*='/tracker/list/']"
     Then eventually I should see "All open issues ·" within 30 seconds
     When I select "Current milestone" from "view"
     Then eventually I should see "Current milestone ·" within 30 seconds
     When I fill in "q" with "#3"
      And I press the key "Enter" on the element "input[name=q]"
     Then eventually I should see "GitHub issue #3 ·" within 30 seconds
     When I fill in "q" with "#1"
      And I press "Show"
     Then eventually I should see "GitHub issue #1 ·" within 30 seconds

