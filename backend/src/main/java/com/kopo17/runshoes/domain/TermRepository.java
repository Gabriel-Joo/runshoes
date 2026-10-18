package com.kopo17.runshoes.domain;

import org.springframework.data.jpa.repository.JpaRepository;

/** 키는 row_no — terms 의 id 는 중복이 있다(V1__schema.sql) */
public interface TermRepository extends JpaRepository<Term, Integer> {}
