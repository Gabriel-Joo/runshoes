import { Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import ShoeList from "./pages/ShoeList";
import Recommend from "./pages/Recommend";
import Best from "./pages/Best";
import ShoeForm from "./pages/ShoeForm";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import ScrollTop from "./components/ScrollTop";
import ResetScroll from "./components/ResetScroll";
import ChatBot from "./components/ChatBot";
import Notice from "./components/Notice";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Account from "./pages/Account";
import { AuthProvider } from "./auth/AuthContext";
import RequireAuth from "./auth/RequireAuth";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <ResetScroll />
      <Header />
      <Notice />
      <Routes>
        <Route path="/" element={<ShoeList />} />
        <Route path="/recommend" element={<Recommend />} />
        <Route path="/best" element={<Best />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
        {/* 관리 화면 — admin 만(실제로 막는 것은 서버의 403) */}
        <Route path="/admin" element={<RequireAuth admin><Admin /></RequireAuth>} />
        <Route path="/new" element={<RequireAuth admin><ShoeForm /></RequireAuth>} />
        <Route path="/edit/:id" element={<RequireAuth admin><ShoeForm /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ScrollTop />
      <ChatBot />
    </AuthProvider>
  );
}

export default App;
