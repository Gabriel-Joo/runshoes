import { useState, useEffect } from "react";
import { asset } from "../api";

import "./Hero.css";

const SLIDES = [
  {
    image: "/images/hero-drop.jpg",
    name: "드롭",
    short: "뒤꿈치와 앞꿈치의 높이 차이입니다",
  },
  {
    image: "/images/hero-outsole.jpg",
    name: "아웃솔",
    short: "지면에 직접 닿는 겉창입니다",
  },
  {
    image: "/images/hero-stack.jpg",
    name: "스택하이트",
    short: "발밑에 깔린 쿠션의 양을 말합니다",
  },
];

function Hero() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="hero">
      <div className="hero__pane hero__pane--copy">
        <h1 className="hero__title">러닝화, 제대로 읽기</h1>
        <p className="hero__subtitle">스펙은 빠짐없이, 용어는 설명과 함께</p>
      </div>

      <div className="hero__pane hero__pane--visual">
        <div className="hero__stage">
          {SLIDES.map((slide, i) => (
            <img
              key={slide.name}
              className={`hero__image ${i === index ? "is-active" : ""}`}
              src={asset(slide.image)}
              alt={slide.name}
            />
          ))}
        </div>

        <div className="hero__caption">
          <span className="hero__term">{SLIDES[index].name}</span>
          <span className="hero__desc">{SLIDES[index].short}</span>

          <div className="hero__dots">
            {SLIDES.map((slide, i) => (
              <button
                key={slide.name}
                className={`hero__dot ${i === index ? "is-active" : ""}`}
                onClick={() => setIndex(i)}
                aria-label={`${slide.name} 슬라이드로 이동`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
