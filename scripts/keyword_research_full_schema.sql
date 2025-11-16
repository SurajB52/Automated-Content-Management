-- =====================================================================
-- Keyword Research + Blog Schema (complete, idempotent)
-- Safe to run repeatedly (uses IF NOT EXISTS)
-- All tables needed by keyword research and blog publishing flows
-- =====================================================================

-- Charset/collation note:
-- Using utf8mb4 with unicode_ci for consistent sorting and emoji support

-- ---------------------------------------------------------------------
-- BLOG CORE
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `blog_authors` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` ENUM('active','inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `can_access_admin` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_blog_authors_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blog_groups` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_blog_groups_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blog` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` LONGTEXT COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_type` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'content',
  `blog_for` VARCHAR(55) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'customer', -- customer | service_provider
  `blog_prompt` TEXT COLLATE utf8mb4_unicode_ci NULL,
  `excerpt` TEXT COLLATE utf8mb4_unicode_ci NOT NULL,
  `featured_image` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `featured_image_alt` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` ENUM('draft','published','scheduled') COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `author_id` INT NOT NULL,
  `blog_group_id` INT DEFAULT NULL,
  `views` INT DEFAULT 0,
  `likes` INT DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `seo_title` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `seo_description` TEXT COLLATE utf8mb4_unicode_ci,
  `seo_keywords` TEXT COLLATE utf8mb4_unicode_ci, -- JSON text
  `og_image` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scheduled_publish` DATETIME DEFAULT NULL,
  `published_at` TIMESTAMP NULL DEFAULT NULL,
  `automation_source` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'csv_upload',
  `rewrite` VARCHAR(50) COLLATE utf8mb4_bin DEFAULT 'no',
  `rich_schema` TEXT COLLATE utf8mb4_unicode_ci, -- JSON-LD
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_blog_slug` (`slug`),
  KEY `idx_blog_status_created` (`status`,`created_at`),
  KEY `idx_blog_group_id` (`blog_group_id`),
  CONSTRAINT `fk_blog_author` FOREIGN KEY (`author_id`) REFERENCES `blog_authors`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_blog_group` FOREIGN KEY (`blog_group_id`) REFERENCES `blog_groups`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional supporting tables frequently used by editor/APIs

CREATE TABLE IF NOT EXISTS `blog_images` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `blog_id` INT NOT NULL,
  `image_path` VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alt_text` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `position` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_blog_images_blog_id` (`blog_id`),
  CONSTRAINT `fk_blog_images_blog` FOREIGN KEY (`blog_id`) REFERENCES `blog`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blog_quotes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `blog_id` INT NOT NULL,
  `quote_text` TEXT COLLATE utf8mb4_unicode_ci NOT NULL,
  `author` VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `position` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_blog_quotes_blog_id` (`blog_id`),
  CONSTRAINT `fk_blog_quotes_blog` FOREIGN KEY (`blog_id`) REFERENCES `blog`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gallery used by gallery/list & upload endpoints
CREATE TABLE IF NOT EXISTS `blog_gallery_images` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `url` VARCHAR(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alt` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gallery_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Automation / rewrite logs (used by rewrite flows)
CREATE TABLE IF NOT EXISTS `blog_rewrite_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `blog_id` INT NOT NULL,
  `status` ENUM('pending','processing','completed','failed','applied') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pending',
  `config` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `original_title` VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `original_slug` VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `original_content` LONGTEXT COLLATE utf8mb4_general_ci,
  `original_excerpt` LONGTEXT COLLATE utf8mb4_general_ci,
  `original_featured_image` VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `original_featured_image_alt` VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `original_seo_title` VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `original_seo_description` TEXT COLLATE utf8mb4_general_ci,
  `original_seo_keywords` TEXT COLLATE utf8mb4_general_ci,
  `rewritten_title` VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `rewritten_slug` VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `rewritten_content` LONGTEXT COLLATE utf8mb4_general_ci,
  `rewritten_excerpt` LONGTEXT COLLATE utf8mb4_general_ci,
  `rewritten_featured_image_alt` VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `rewritten_seo_title` VARCHAR(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `rewritten_seo_description` TEXT COLLATE utf8mb4_general_ci,
  `rewritten_seo_keywords` TEXT COLLATE utf8mb4_general_ci,
  `error_message` LONGTEXT COLLATE utf8mb4_general_ci,
  `created_at` DATETIME DEFAULT NULL,
  `completed_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_blog_rewrite_logs_blog_id` (`blog_id`),
  CONSTRAINT `fk_blog_rewrite_logs_blog` FOREIGN KEY (`blog_id`) REFERENCES `blog`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Optional admin permission mapping (not strictly required by KR, but present in repo)
CREATE TABLE IF NOT EXISTS `blog_author_permissions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `blog_author_id` INT NOT NULL,
  `admin_page_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_blog_author_permissions_author_id` (`blog_author_id`),
  CONSTRAINT `fk_blog_author_permissions_author` FOREIGN KEY (`blog_author_id`) REFERENCES `blog_authors`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------
-- KEYWORD RESEARCH
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `keyword_research` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `keyword` VARCHAR(255) NOT NULL,
  `location` VARCHAR(255) DEFAULT NULL,
  `search_results` LONGTEXT,               -- JSON array of SERP results
  `extracted_keywords` LONGTEXT,           -- JSON { single_words: [[word, freq]], phrases: [{...}] }
  `custom_keywords` LONGTEXT,              -- JSON { single_words: string[], phrases: string[] }
  `created_by` VARCHAR(255) DEFAULT NULL,
  `blog_generated` TINYINT(1) NOT NULL DEFAULT 0,
  `blog_id` INT DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_blog_generated` (`blog_generated`),
  KEY `idx_created_at` (`created_at`),
  KEY `keyword_research_ibfk_1` (`blog_id`),
  CONSTRAINT `keyword_research_ibfk_1` FOREIGN KEY (`blog_id`) REFERENCES `blog`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `keyword_research_html` (
  `keyword_research_id` INT NOT NULL,
  `tags_data` LONGTEXT,                    -- JSON payload of extracted tags/analysis
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_keyword_research_id` (`keyword_research_id`),
  CONSTRAINT `keyword_research_html_ibfk_1` FOREIGN KEY (`keyword_research_id`) REFERENCES `keyword_research`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- SYSTEM PROMPTS (used by KR flow)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `system_prompts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL, -- e.g. 'blog_content_keyword_research'
  `prompt_for` VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL, -- e.g. 'customer_kr' | 'service_provider_kr'
  `prompt` LONGTEXT COLLATE utf8mb4_unicode_ci NULL,
  `company_name` VARCHAR(255) COLLATE utf8mb4_unicode_ci NULL,
  `company_about` TEXT COLLATE utf8mb4_unicode_ci NULL,
  `company_details` TEXT COLLATE utf8mb4_unicode_ci NULL,
  `location` VARCHAR(255) COLLATE utf8mb4_unicode_ci NULL,
  `keyword_guideline` TEXT COLLATE utf8mb4_unicode_ci NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_type_prompt_for` (`type`, `prompt_for`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Helpful indexes for performance (optional)
-- ---------------------------------------------------------------------
-- CREATE INDEX idx_kr_created_at ON `keyword_research` (`created_at`);
-- CREATE INDEX idx_kr_blog_generated_created ON `keyword_research` (`blog_generated`, `created_at`);

