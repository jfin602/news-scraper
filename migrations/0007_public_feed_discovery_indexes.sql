CREATE INDEX articles_public_feed_visible_order_idx
  ON articles (
    (
      CASE
        WHEN published_at_status = 'parsed' THEN published_at
        ELSE first_seen_at
      END
    ) DESC,
    first_seen_at DESC,
    id ASC
  )
  WHERE visibility_state = 'visible';

CREATE INDEX articles_source_public_feed_visible_order_idx
  ON articles (
    source_id,
    (
      CASE
        WHEN published_at_status = 'parsed' THEN published_at
        ELSE first_seen_at
      END
    ) DESC,
    first_seen_at DESC,
    id ASC
  )
  WHERE visibility_state = 'visible';

CREATE INDEX article_categories_category_article_lookup_idx
  ON article_categories (category_id, article_id);
