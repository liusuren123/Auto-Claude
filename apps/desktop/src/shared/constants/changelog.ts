/**
 * Changelog-related constants
 * Format options, audience types, and generation configuration
 */

// ============================================
// Changelog Formats
// ============================================

export const CHANGELOG_FORMAT_LABELS: Record<string, string> = {
  'keep-a-changelog': 'changelog.format.keepAChangelog',
  'simple-list': 'changelog.format.simpleList',
  'github-release': 'changelog.format.githubRelease'
};

export const CHANGELOG_FORMAT_DESCRIPTIONS: Record<string, string> = {
  'keep-a-changelog': 'changelog.formatDescription.keepAChangelog',
  'simple-list': 'changelog.formatDescription.simpleList',
  'github-release': 'changelog.formatDescription.githubRelease'
};

// ============================================
// Changelog Audience
// ============================================

export const CHANGELOG_AUDIENCE_LABELS: Record<string, string> = {
  'technical': 'changelog.audience.technical',
  'user-facing': 'changelog.audience.userFacing',
  'marketing': 'changelog.audience.marketing'
};

export const CHANGELOG_AUDIENCE_DESCRIPTIONS: Record<string, string> = {
  'technical': 'changelog.audienceDescription.technical',
  'user-facing': 'changelog.audienceDescription.userFacing',
  'marketing': 'changelog.audienceDescription.marketing'
};

// ============================================
// Changelog Emoji Level
// ============================================

export const CHANGELOG_EMOJI_LEVEL_LABELS: Record<string, string> = {
  'none': 'changelog.emojiLevel.none',
  'little': 'changelog.emojiLevel.headingsOnly',
  'medium': 'changelog.emojiLevel.headingsAndHighlights',
  'high': 'changelog.emojiLevel.everything'
};

export const CHANGELOG_EMOJI_LEVEL_DESCRIPTIONS: Record<string, string> = {
  'none': 'changelog.emojiLevelDescription.none',
  'little': 'changelog.emojiLevelDescription.headingsOnly',
  'medium': 'changelog.emojiLevelDescription.headingsAndHighlights',
  'high': 'changelog.emojiLevelDescription.everything'
};

// ============================================
// Changelog Source Mode
// ============================================

export const CHANGELOG_SOURCE_MODE_LABELS: Record<string, string> = {
  'tasks': 'changelog.sourceMode.completedTasks',
  'git-history': 'changelog.sourceMode.gitHistory',
  'branch-diff': 'changelog.sourceMode.branchComparison'
};

export const CHANGELOG_SOURCE_MODE_DESCRIPTIONS: Record<string, string> = {
  'tasks': 'changelog.sourceModeDescription.completedTasks',
  'git-history': 'changelog.sourceModeDescription.gitHistory',
  'branch-diff': 'changelog.sourceModeDescription.branchComparison'
};

// ============================================
// Git History Types
// ============================================

export const GIT_HISTORY_TYPE_LABELS: Record<string, string> = {
  'recent': 'changelog.gitHistoryType.recent',
  'since-date': 'changelog.gitHistoryType.sinceDate',
  'tag-range': 'changelog.gitHistoryType.betweenTags'
};

export const GIT_HISTORY_TYPE_DESCRIPTIONS: Record<string, string> = {
  'recent': 'changelog.gitHistoryTypeDescription.recent',
  'since-date': 'changelog.gitHistoryTypeDescription.sinceDate',
  'tag-range': 'changelog.gitHistoryTypeDescription.betweenTags'
};

// ============================================
// Changelog Generation Stages
// ============================================

export const CHANGELOG_STAGE_LABELS: Record<string, string> = {
  'loading_specs': 'changelog.stage.loadingSpecs',
  'loading_commits': 'changelog.stage.loadingCommits',
  'generating': 'changelog.stage.generating',
  'formatting': 'changelog.stage.formatting',
  'complete': 'changelog.stage.complete',
  'error': 'changelog.stage.error'
};

// ============================================
// Default Configuration
// ============================================

// Default changelog file path
export const DEFAULT_CHANGELOG_PATH = 'CHANGELOG.md';
