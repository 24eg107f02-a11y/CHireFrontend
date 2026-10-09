import { useEffect, useMemo, useState } from 'react'
import api from './api'
import './App.css'

const emptyProfile = {
  collegeId: '',
  branch: '',
  academicYear: '',
  cgpa: '',
  qualification: '',
  skills: '',
  projects: '',
  resumeDetails: '',
  areasOfInterest: '',
  phone: '',
}

const profileFields = [
  { name: 'collegeId', label: 'College ID', required: true },
  { name: 'branch', label: 'Branch', required: true },
  { name: 'academicYear', label: 'Academic year', required: true, type: 'number' },
  { name: 'cgpa', label: 'CGPA', required: true, type: 'number', step: '0.01' },
  { name: 'qualification', label: 'Qualification', required: true },
  { name: 'phone', label: 'Phone', required: true },
  { name: 'skills', label: 'Skills' },
  { name: 'projects', label: 'Projects' },
  { name: 'resumeDetails', label: 'Resume details' },
  { name: 'areasOfInterest', label: 'Areas of interest' },
]

const getErrorMessage = (error) =>
  error.response?.data?.message || error.response?.data?.error || error.message || 'Request failed'

const toDisplayStatus = (status = '') =>
  status.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

const toList = (value = '') =>
  Array.isArray(value) ? value : (value || '').split(',').map((item) => item.trim()).filter(Boolean)

function App() {
  const [authMode, setAuthMode] = useState('login')
  const [role, setRole] = useState(() => localStorage.getItem('campushire_role') || 'student')
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(
    localStorage.getItem('campushire_token') && localStorage.getItem('campushire_role'),
  ))
  const [fullName, setFullName] = useState(() => localStorage.getItem('campushire_full_name') || '')
  const [profile, setProfile] = useState(emptyProfile)
  const [hasProfile, setHasProfile] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [jobs, setJobs] = useState([])
  const [applications, setApplications] = useState([])
  const [pendingJobs, setPendingJobs] = useState([])
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'student',
  })
  const [error, setError] = useState('')
  const [dashboardError, setDashboardError] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!isLoggedIn || role !== 'student') return

    let cancelled = false
    const loadStudentDashboard = async () => {
      setProfileLoading(true)
      setDashboardError('')

      try {
        let savedProfile = null
        try {
          const profileResponse = await api.get('/students/me')
          savedProfile = profileResponse.data
        } catch (requestError) {
          if (requestError.response?.status !== 404) throw requestError
        }

        const [jobsResponse, applicationsResponse] = await Promise.all([
          api.get('/jobs'),
          api.get('/students/me/applications'),
        ])
        if (cancelled) return

        const storedName = localStorage.getItem('campushire_full_name') || ''
        setFullName(savedProfile?.fullName || storedName)
        setProfile({
          ...emptyProfile,
          ...(savedProfile || {}),
          academicYear: savedProfile?.academicYear ?? '',
          cgpa: savedProfile?.cgpa ?? '',
        })
        setHasProfile(Boolean(savedProfile))
        setJobs(jobsResponse.data.map((job) => ({
          id: job.id,
          title: job.title,
          company: job.company?.name || 'Company',
          location: job.location,
          type: job.jobType,
          tags: toList(job.requiredSkills),
          minimumCgpa: job.minimumCgpa,
          status: toDisplayStatus(job.status),
          match: null,
        })))
        setApplications(applicationsResponse.data.map((application) => ({
          id: application.id,
          job: application.job?.title || 'Job',
          student: application.student?.fullName || storedName,
          status: toDisplayStatus(application.status),
        })))
      } catch (requestError) {
        if (!cancelled) setDashboardError(`Could not load your dashboard: ${getErrorMessage(requestError)}`)
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    }

    loadStudentDashboard()
    return () => {
      cancelled = true
    }
  }, [isLoggedIn, role])

  const recommendedJobs = useMemo(() => {
    return [...jobs]
      .map((job) => ({
        ...job,
        match: Math.min(
          99,
          Math.max(
            55,
            Math.round(
              60 +
                (Number(profile.cgpa) >= job.minimumCgpa ? 18 : 8) +
                job.tags.filter((tag) => (profile.skills || '').toLowerCase().includes(tag.toLowerCase())).length * 10,
            ),
          ),
        ),
      }))
      .sort((a, b) => b.match - a.match)
  }, [jobs, profile])

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setError('')

    try {
      const payload = {
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        role: form.role.toUpperCase(),
      }

      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register'
      const response = await api.post(endpoint, authMode === 'login' ? {
        email: form.email,
        password: form.password,
      } : payload)

      const { token, role: responseRole, fullName: responseName } = response.data
      if (!token) throw new Error('The server did not return an authentication token')
      const userRole = responseRole.toLowerCase()
      const userName = responseName || (authMode === 'register' ? form.fullName : '')
      localStorage.setItem('campushire_token', token)
      localStorage.setItem('campushire_role', userRole)
      localStorage.setItem('campushire_email', response.data.email)
      localStorage.setItem('campushire_full_name', userName)
      setRole(userRole)
      setFullName(userName)
      setIsLoggedIn(true)
    } catch (requestError) {
      console.error('Auth request failed:', requestError)
      setError(`Could not ${authMode === 'login' ? 'log in' : 'register'}: ${getErrorMessage(requestError)}`)
    }
  }

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    setActionError('')
    setProfileSaving(true)
    const profilePayload = {
      ...profile,
      academicYear: Number(profile.academicYear),
      cgpa: Number(profile.cgpa),
    }

    try {
      const response = await api.request({
        method: hasProfile ? 'put' : 'post',
        url: '/students/profile',
        data: profilePayload,
      })
      setProfile({ ...emptyProfile, ...response.data, academicYear: response.data.academicYear, cgpa: response.data.cgpa })
      setHasProfile(true)
    } catch (requestError) {
      setActionError(`Could not save your profile: ${getErrorMessage(requestError)}`)
    } finally {
      setProfileSaving(false)
    }
  }

  const handleApply = async (jobId) => {
    setActionError('')
    try {
      await api.post(`/students/jobs/${jobId}/apply`, {})
      const response = await api.get('/students/me/applications')
      const storedName = localStorage.getItem('campushire_full_name') || ''
      setApplications(response.data.map((application) => ({
        id: application.id,
        job: application.job?.title || 'Job',
        student: application.student?.fullName || storedName,
        status: toDisplayStatus(application.status),
      })))
    } catch (requestError) {
      setActionError(`Could not apply: ${getErrorMessage(requestError)}`)
    }
  }

  const handleAddJob = (event) => {
    event.preventDefault()
    const title = event.target.title.value
    const company = event.target.company.value
    const location = event.target.location.value
    const type = event.target.type.value
    const minimumCgpa = Number(event.target.minimumCgpa.value || 7)

    const newJob = {
      id: Date.now(),
      title,
      company,
      location,
      type,
      tags: ['Java', 'Communication'],
      minimumCgpa,
      eligibleBranches: ['Computer Science', 'Information Technology'],
      status: 'Pending',
      match: 78,
    }

    setJobs((current) => [newJob, ...current])
    setPendingJobs((current) => [{ id: newJob.id, title, company, status: 'Pending' }, ...current])
    event.target.reset()
  }

  const handleDecision = (jobId, decision) => {
    setPendingJobs((current) => current.filter((job) => job.id !== jobId))
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? { ...job, status: decision === 'approve' ? 'Approved' : 'Rejected' }
          : job,
      ),
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">CH</div>
          <div>
            <div className="brand-name">CampusHire</div>
            <div className="brand-subtitle">Placement & career platform</div>
          </div>
        </div>

        {!isLoggedIn ? (
          <div className="topbar-actions">
            <button className="ghost-button" onClick={() => setAuthMode('login')}>Login</button>
            <button className="primary-button" onClick={() => setAuthMode('register')}>Register</button>
          </div>
        ) : (
          <div className="user-badge">
            <span>{role}</span>
            <button
              className="ghost-button"
              onClick={() => {
                localStorage.removeItem('campushire_token')
                localStorage.removeItem('campushire_role')
                localStorage.removeItem('campushire_email')
                localStorage.removeItem('campushire_full_name')
                setFullName('')
                setProfile(emptyProfile)
                setHasProfile(false)
                setJobs([])
                setApplications([])
                setDashboardError('')
                setActionError('')
                setIsLoggedIn(false)
              }}
            >
              Logout
            </button>
          </div>
        )}
      </header>

      {!isLoggedIn ? (
        <main className="landing-grid">
          <section className="hero-panel">
            <div className="eyebrow">Trusted by 120+ campus recruiters</div>
            <h1>Hire the brightest talent from your campus.</h1>
            <p>
              A complete placement workflow for students, recruiters, and administrators — from profile
              visibility to job approval, interviews, and offers.
            </p>

            <div className="stats-grid">
              <div>
                <strong>18K+</strong>
                <span>Student profiles</span>
              </div>
              <div>
                <strong>350+</strong>
                <span>Active recruiters</span>
              </div>
              <div>
                <strong>92%</strong>
                <span>Offer acceptance</span>
              </div>
            </div>
          </section>

          <section className="auth-card">
            <div className="auth-tabs">
              <button
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => setAuthMode('login')}
              >
                Login
              </button>
              <button
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => setAuthMode('register')}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="auth-form">
              {authMode === 'register' && (
                <label>
                  Full name
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                    placeholder="Your name"
                    required
                  />
                </label>
              )}

              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="name@college.edu"
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="••••••••"
                />
              </label>

              <label>
                Role
                <select
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value })}
                >
                  <option value="student">Student</option>
                  <option value="recruiter">Recruiter</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              {error && <div className="error-banner">{error}</div>}

              <button type="submit" className="primary-button wide-button">
                {authMode === 'login' ? 'Access dashboard' : 'Create account'}
              </button>
            </form>
          </section>
        </main>
      ) : (
        <main className="dashboard-shell">
          <aside className="sidebar">
            <div className="nav-group">
              <div className="sidebar-button active">{role}</div>
            </div>
          </aside>

          <section className="dashboard-content">
            {dashboardError && <div className="error-banner">{dashboardError}</div>}
            {actionError && <div className="error-banner">{actionError}</div>}
            {role === 'student' && (
              profileLoading ? (
                <section className="panel"><p>Loading your student information...</p></section>
              ) : !hasProfile ? (
                <section className="panel">
                  <div className="eyebrow">Student profile setup</div>
                  <h2>Welcome{fullName ? `, ${fullName}` : ''}. Tell us about yourself.</h2>
                  <p className="form-help">Your profile is saved to your account and used for eligibility checks and recommendations.</p>
                  <form className="profile-form" onSubmit={handleProfileSubmit}>
                    <div className="profile-grid">
                      {profileFields.map((field) => (
                        <label key={field.name}>
                          {field.label}
                          <input
                            type={field.type || 'text'}
                            step={field.step}
                            min={field.name === 'academicYear' ? 1 : undefined}
                            max={field.name === 'cgpa' ? 10 : undefined}
                            required={field.required}
                            value={profile[field.name] ?? ''}
                            onChange={(event) => setProfile((current) => ({
                              ...current,
                              [field.name]: event.target.value,
                            }))}
                          />
                        </label>
                      ))}
                    </div>
                    <button className="primary-button" type="submit" disabled={profileSaving}>
                      {profileSaving ? 'Saving profile...' : 'Save profile and continue'}
                    </button>
                  </form>
                </section>
              ) : (
                <>
                  <div className="panel hero-mini">
                    <div>
                      <div className="eyebrow">Student overview</div>
                      <h2>Welcome back, {fullName || localStorage.getItem('campushire_email')}</h2>
                    </div>
                    <div className="status-pill">Eligible for {recommendedJobs.filter((job) => job.match >= 80).length} roles</div>
                  </div>

                  <div className="two-column">
                    <section className="panel">
                      <h3>Your profile</h3>
                      <form className="profile-form" onSubmit={handleProfileSubmit}>
                        <div className="profile-grid">
                          {profileFields.map((field) => (
                            <label key={field.name}>
                              {field.label}
                              <input
                                type={field.type || 'text'}
                                step={field.step}
                                min={field.name === 'academicYear' ? 1 : undefined}
                                max={field.name === 'cgpa' ? 10 : undefined}
                                required={field.required}
                                value={profile[field.name] ?? ''}
                                onChange={(event) => setProfile((current) => ({
                                  ...current,
                                  [field.name]: event.target.value,
                                }))}
                              />
                            </label>
                          ))}
                        </div>
                        <button className="primary-button" type="submit" disabled={profileSaving}>
                          {profileSaving ? 'Saving...' : 'Save changes'}
                        </button>
                      </form>
                    </section>

                    <section className="panel">
                      <h3>Recommended roles</h3>
                      <div className="mini-stack">
                        {recommendedJobs.slice(0, 3).map((job) => (
                          <div className="mini-card" key={job.id}>
                            <div>
                              <strong>{job.title}</strong>
                              <span>{job.company}</span>
                            </div>
                            <div className="score-tag">{job.match}% match</div>
                          </div>
                        ))}
                        {recommendedJobs.length === 0 && <p>No approved roles are available yet.</p>}
                      </div>
                    </section>
                  </div>

                  <section className="panel">
                    <div className="section-header">
                      <h3>Open jobs</h3>
                      <span>{jobs.length} available</span>
                    </div>
                    <div className="job-list">
                      {jobs.map((job) => (
                        <article className="job-card" key={job.id}>
                          <div className="job-head">
                            <div>
                              <h4>{job.title}</h4>
                              <span>{job.company}</span>
                            </div>
                            <span className="chip">{job.type}</span>
                          </div>
                          <div className="meta-row">
                            <span>{job.location}</span>
                            <span>CGPA ≥ {job.minimumCgpa}</span>
                            <span>{job.status}</span>
                          </div>
                          <div className="tag-row">
                            {job.tags.map((tag) => (
                              <span key={tag} className="tag">{tag}</span>
                            ))}
                          </div>
                          <div className="job-actions">
                            <span className="match-badge">{recommendedJobs.find((item) => item.id === job.id)?.match ?? 0}% fit</span>
                            <button className="primary-button" onClick={() => handleApply(job.id)}>
                              Apply now
                            </button>
                          </div>
                        </article>
                      ))}
                      {jobs.length === 0 && <p>No approved job listings are available yet.</p>}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="section-header">
                      <h3>Applications</h3>
                      <span>{applications.length} total</span>
                    </div>
                    <div className="application-list">
                      {applications.map((application) => (
                        <div className="application-row" key={application.id}>
                          <span>{application.job}</span>
                          <span>{application.student}</span>
                          <span className="status-pill subtle">{application.status}</span>
                        </div>
                      ))}
                      {applications.length === 0 && <p>You have not applied to any jobs yet.</p>}
                    </div>
                  </section>
                </>
              )
            )}

            {role === 'recruiter' && (
              <>
                <div className="panel hero-mini">
                  <div>
                    <div className="eyebrow">Recruiter workspace</div>
                    <h2>Post, review, and shortlist candidates</h2>
                  </div>
                  <div className="status-pill">{jobs.filter((job) => job.status === 'Approved').length} active jobs</div>
                </div>

                <div className="two-column">
                  <section className="panel">
                    <h3>Create new role</h3>
                    <form className="job-form" onSubmit={handleAddJob}>
                      <input name="title" placeholder="Job title" required />
                      <input name="company" placeholder="Company name" required />
                      <input name="location" placeholder="Location" required />
                      <input name="type" placeholder="Type (Internship/Full-time)" required />
                      <input name="minimumCgpa" type="number" step="0.1" placeholder="Minimum CGPA" required />
                      <button className="primary-button wide-button" type="submit">Publish role</button>
                    </form>
                  </section>

                  <section className="panel">
                    <h3>Talent pipeline</h3>
                    <div className="mini-stack">
                      {applications.map((application) => (
                        <div className="mini-card" key={application.id}>
                          <div>
                            <strong>{application.student}</strong>
                            <span>{application.job}</span>
                          </div>
                          <span className="status-pill subtle">{application.status}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="panel">
                  <div className="section-header">
                    <h3>Role board</h3>
                    <span>{jobs.length} jobs</span>
                  </div>
                  <div className="job-list compact">
                    {jobs.map((job) => (
                      <article className="job-card" key={job.id}>
                        <div className="job-head">
                          <div>
                            <h4>{job.title}</h4>
                            <span>{job.company}</span>
                          </div>
                          <span className="chip">{job.status}</span>
                        </div>
                        <div className="meta-row">
                          <span>{job.type}</span>
                          <span>{job.location}</span>
                          <span>{job.tags.join(', ')}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            )}

            {role === 'admin' && (
              <>
                <div className="panel hero-mini">
                  <div>
                    <div className="eyebrow">Admin approvals</div>
                    <h2>Review and approve campus hiring requests</h2>
                  </div>
                  <div className="status-pill">{pendingJobs.length} pending</div>
                </div>

                <section className="panel">
                  <div className="section-header">
                    <h3>Pending roles</h3>
                    <span>{pendingJobs.length} waiting</span>
                  </div>
                  <div className="job-list compact">
                    {pendingJobs.map((job) => (
                      <article className="job-card" key={job.id}>
                        <div className="job-head">
                          <div>
                            <h4>{job.title}</h4>
                            <span>{job.company}</span>
                          </div>
                          <span className="chip">{job.status}</span>
                        </div>
                        <div className="job-actions admin-actions">
                          <button className="ghost-button" onClick={() => handleDecision(job.id, 'reject')}>
                            Reject
                          </button>
                          <button className="primary-button" onClick={() => handleDecision(job.id, 'approve')}>
                            Approve
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            )}
          </section>
        </main>
      )}
    </div>
  )
}

export default App
