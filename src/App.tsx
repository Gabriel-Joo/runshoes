import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import ShoeList from './pages/ShoeList'
import Best from './pages/Best'
import ShoeForm from './pages/ShoeForm'
import NotFound from './pages/NotFound'
import "./App.css"

function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<ShoeList />} />
        <Route path="/best" element={<Best />} />
        <Route path="/new" element={<ShoeForm />} />
        <Route path="/edit/:id" element={<ShoeForm />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}

export default App;
