Feature: The GitHub plugin on a project row
  Once the plugin is activated and installed, every project whose git remote is on GitHub carries
  the GITHUB menu, and the Plugins page lists the plugin with its four steps.

  Scenario: A project cloned from GitHub offers the GITHUB menu
    Given I am on "/dev"
     Then the element ".act-menu-github" should be displayed
      And I should see "GITHUB"

  Scenario: The plugin is listed on the Plugins page
    Given I am on "/settings/plugins"
     Then I should see "GitHub"
      And I should see "@webship/workspace-github"
