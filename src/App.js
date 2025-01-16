// React and routing
import { useState, memo } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { ThemeProvider } from "styled-components";

// Themes and styles
import { darkTheme, lightTheme } from "./utils/Themes.js";
import styled from "styled-components";
import "./App.css";

// Components
import Navbar from "./components/Navbar";
import HeroSection from "./components/HeroSection";
import Skills from "./components/Skills";
import Projects from "./components/Projects";
import Footer from "./components/Footer";
import Experience from "./components/Experience";
import Education from "./components/Education";
import ProjectDetails from "./components/ProjectDetails";
import Chatbot from "./components/Chatbot/index.jsx";

const Body = styled.div.withConfig({
  shouldComponentUpdate: true,
})`
  background-color: ${({ theme }) => theme.bg};
  width: 100%;
  overflow-x: hidden;
`;

const Wrapper = styled.div.withConfig({
  shouldComponentUpdate: true,
})`
  background: linear-gradient(
      38.73deg,
      rgba(204, 0, 187, 0.15) 0%,
      rgba(201, 32, 184, 0) 50%
    ),
    linear-gradient(
      141.27deg,
      rgba(0, 70, 209, 0) 50%,
      rgba(0, 70, 209, 0.15) 100%
    );
  width: 100%;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 30% 98%, 0 100%);
`;

// Memoize static components
const MemoizedSkills = memo(Skills);
const MemoizedExperience = memo(Experience);
const MemoizedEducation = memo(Education);
const MemoizedFooter = memo(Footer);
const MemoizedHeroSection = memo(HeroSection);

function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [openModal, setOpenModal] = useState({ state: false, project: null });

  return (
    <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
      <Router>
        <Navbar darkMode={darkMode} setDarkMode={setDarkMode} />
        <Body>
          <MemoizedHeroSection />
          <Wrapper>
            <MemoizedSkills />
            <MemoizedExperience />
          </Wrapper>
          <Projects openModal={openModal} setOpenModal={setOpenModal} />
          <Wrapper>
            <MemoizedEducation />
          </Wrapper>
          <MemoizedFooter />
          {openModal.state && (
            <ProjectDetails openModal={openModal} setOpenModal={setOpenModal} />
          )}
          <Chatbot />
        </Body>
      </Router>
    </ThemeProvider>
  );
}

export default memo(App);
