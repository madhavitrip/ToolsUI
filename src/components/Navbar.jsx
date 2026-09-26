import React, { useState, useEffect, useRef } from "react";
import { FiMenu, FiChevronDown } from "react-icons/fi";
import { Search, Folder, Box, FileText, ChevronRight, Package } from "lucide-react";
import { useToast } from "./../hooks/useToast";
import useStore from "../stores/ProjectData";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import { addRecentProject } from '../utils/recentProjects';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL; // Using base URL for groups/projects
const API_URL = import.meta.env.VITE_API_URL; // Using Tools API for project data

export default function Navbar({ onToggleSidebar, onLogout, searchQuery, onSearchChange, searchPlaceholder = "Search..." }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [lotFilterOpen, setLotFilterOpen] = useState(false);
  const [lots, setLots] = useState([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  
  const projectId = useStore((state) => state.projectId);
  const selectedLot = useStore((state) => state.selectedLot);
  const setSelectedLot = useStore((state) => state.setSelectedLot);
  const setProject = useStore((state) => state.setProject);
  const allProjects = useStore((state) => state.allProjects);
  const allGroups = useStore((state) => state.allGroups);
  const setAllProjects = useStore((state) => state.setAllProjects);
  const setAllGroups = useStore((state) => state.setAllGroups);

  const [dataResults, setDataResults] = useState([]);
  const [projectResults, setProjectResults] = useState([]);
  const [groupResults, setGroupResults] = useState([]);
  
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef(null);
  const lotFilterRef = useRef(null);
  
  const token = localStorage.getItem("token");

  // Fetch all projects and groups if not already in store
  useEffect(() => {
    const fetchData = async () => {
      if (allProjects.length === 0 || allGroups.length === 0) {
        try {
          // Fetch Groups
          const groupsRes = await axios.get(`${API_BASE_URL}/Groups`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setAllGroups(groupsRes.data);

          // Fetch All Project names/details
          const projRes = await axios.get(`${API_BASE_URL}/Project`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          // Also fetch user's active projects to combine
          const userProjRes = await axios.get(`${API_URL}/Projects/UserId`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          const combinedProjects = userProjRes.data.map((project) => {
            const projData = projRes.data.find(p => p.projectId === project.projectId) || {};
            return {
              id: project.projectId,
              name: projData.name || 'Unknown Project',
              groupId: projData.groupId || project.groupId,
              typeId: projData.typeId || project.typeId,
              isActive: project.isActive,
            };
          });

          setAllProjects(combinedProjects);
        } catch (error) {
          console.error("Failed to fetch project/group data for search:", error);
        }
      }
    };

    if (token) fetchData();
  }, [allProjects.length, allGroups.length, token]);

  // Fetch lots when projectId changes or on refresh event
  useEffect(() => {
    if (projectId && token) {
      fetchLots();
    } else {
      setLots([]);
    }
  }, [projectId, token]);

  useEffect(() => {
    const handleRefreshLots = () => {
      if (projectId && token) {
        fetchLots();
      }
    };
    window.addEventListener("refreshLots", handleRefreshLots);
    return () => window.removeEventListener("refreshLots", handleRefreshLots);
  }, [projectId, token]);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchDropdown(false);
      }
      if (lotFilterRef.current && !lotFilterRef.current.contains(event.target)) {
        setLotFilterOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search within project when user types
  const fetchLots = async () => {
    if (!projectId) return;
    
    setLoadingLots(true);
    try {
      const response = await axios.get(`${API_URL}/NRDataLots/GetByProjectId/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data && Array.isArray(response.data)) {
        const validLots = response.data.filter(lot => lot.lotNo > 0);
        setLots(validLots);
      } else {
        setLots([]);
      }
    } catch (error) {
      console.error("Failed to fetch lots:", error);
      setLots([]);
    } finally {
      setLoadingLots(false);
    }
  };

  const handleLotSelect = (lot) => {
    setSelectedLot(lot.lotNo);
    setLotFilterOpen(false);
  };

  const handleSearchChange = async (e) => {
    const value = e.target.value;
    onSearchChange(value);

    if (value.trim().length > 0) {
      const searchLower = value.toLowerCase();

      // 1. Search Groups
      const filteredGroups = allGroups.filter(g => 
        g.name.toLowerCase().includes(searchLower)
      ).slice(0, 5);
      setGroupResults(filteredGroups);

      // 2. Search Projects
      const filteredProjects = allProjects.filter(p => 
        p.name.toLowerCase().includes(searchLower)
      ).slice(0, 5);
      setProjectResults(filteredProjects);

      // 3. Search Data within current project (if applicable)
      if (projectId) {
        setIsSearching(true);
        try {
          const response = await axios.get(
            `${API_URL}/NRDatas/GetByProjectId/${projectId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (response.data && Array.isArray(response.data)) {
            const filteredData = response.data.filter((item) => {
              return (
                (item.catchNo && item.catchNo.toString().toLowerCase().includes(searchLower)) ||
                (item.serialNumber && item.serialNumber.toString().toLowerCase().includes(searchLower)) ||
                (item.nrQuantity && item.nrQuantity.toString().toLowerCase().includes(searchLower))
              );
            }).slice(0, 8);
            setDataResults(filteredData);
          } else {
            setDataResults([]);
          }
        } catch (error) {
          console.warn("Data search error:", error.message);
          setDataResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setDataResults([]);
      }

      const isDashboard = location.pathname === "/dashboard";
      setShowSearchDropdown(!isDashboard);
    } else {
      setGroupResults([]);
      setProjectResults([]);
      setDataResults([]);
      setShowSearchDropdown(false);
    }
  };

  const handleProjectClick = (project) => {
    setProject(project.name, project.id, project.groupId, project.typeId);
    
    // Log project entry to localStorage
    addRecentProject({ id: project.id, name: project.name, groupId: project.groupId, typeId: project.typeId });
    
    setShowSearchDropdown(false);
    onSearchChange(""); // Clear search bar
    navigate("/projectdashboard");
  };

  const handleGroupClick = (group) => {
    setShowSearchDropdown(false);
    onSearchChange(""); // Clear search bar
    // If not on dashboard, go to dashboard with this group selected
    // Note: Dashboard component reads selectedGroupId from its own state or external props
    // We can use a trick to pass the group selection to the dashboard
    navigate("/dashboard", { state: { selectedGroupId: group.id } });
  };

  const handleDataClick = (item) => {
    console.log("Selected data result:", item);
    setShowSearchDropdown(false);
    // Standard data click action can be added here
  };

  return (
    <nav className="bg-gray-100 border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm z-50">
      {/* Left: Menu + Branding */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="text-gray-700 hover:text-blue-600 focus:outline-none"
        >
          <FiMenu className="text-2xl" />
        </button>
        <span className="font-bold text-xl text-gray-800 hidden md:inline">ERP Tools</span>
      </div>

      {/* Right: Lot Filter + Search + Profile */}
      <div className="flex items-center gap-4">
        {/* Lot Filter Dropdown - Only show when in project */}
        {projectId && (
          <div className="relative" ref={lotFilterRef}>
            <button
              onClick={() => {
                const nextOpen = !lotFilterOpen;
                setLotFilterOpen(nextOpen);
                if (nextOpen) {
                  fetchLots();
                }
              }}
              className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all text-slate-700 text-base font-medium"
            >
              <Package size={16} className="text-blue-600" />
              <span>Lot: {selectedLot ? selectedLot : 'All'}</span>
              <FiChevronDown className={`text-lg transition-transform ${lotFilterOpen ? 'rotate-180' : ''}`} />
            </button>

            {lotFilterOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-[100] min-w-max">
                <div className="p-2">
                  {loadingLots ? (
                    <div className="px-3 py-2 text-xs text-slate-500 animate-pulse">Loading lots...</div>
                  ) : lots.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500">No lots available</div>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <button
                        onClick={() => {
                          setSelectedLot(null);
                          setLotFilterOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          selectedLot === null 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        All Lots
                      </button>
                      {lots.map((lot) => (
                        <button
                          key={lot.lotNo}
                          onClick={() => handleLotSelect(lot)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between ${
                            selectedLot === lot.lotNo
                              ? 'bg-blue-100 text-blue-700'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span>Lot {lot.lotNo}</span>
                          <span className="text-xs text-slate-500">({lot.catchCount} catches)</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search Bar with Dropdown for Project Search */}
        <div className="relative" ref={searchRef}>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-72 pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-slate-700 text-sm font-medium placeholder:text-slate-400 shadow-sm"
          />

          {showSearchDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-[100] max-h-[80vh] overflow-y-auto w-[400px] md:w-[500px]">
              <div className="p-2 space-y-4">
                {isSearching && (
                  <div className="text-xs font-semibold text-slate-500 px-3 py-2 animate-pulse">
                    Searching...
                  </div>
                )}
                
                {/* Groups Section */}
                {groupResults.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 mb-1">
                      <Folder size={12} className="text-blue-500" />
                      Business Groups
                    </div>
                    <div className="space-y-0.5">
                      {groupResults.map((group) => (
                        <div
                          key={`group-${group.id}`}
                          onClick={() => handleGroupClick(group)}
                          className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 cursor-pointer rounded-lg transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              <Folder size={16} />
                            </div>
                            <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-700">{group.name}</span>
                          </div>
                          <ChevronRight size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Projects Section */}
                {projectResults.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 mb-1">
                      <Box size={12} className="text-indigo-500" />
                      Projects
                    </div>
                    <div className="space-y-0.5">
                      {projectResults.map((project) => (
                        <div
                          key={`proj-${project.id}`}
                          onClick={() => handleProjectClick(project)}
                          className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 cursor-pointer rounded-lg transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                              <Box size={16} />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-700 group-hover:text-indigo-700">{project.name}</div>
                              <div className="text-[10px] text-slate-400 font-medium">Click to enter workspace</div>
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Section (Only if in project) */}
                {dataResults.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 mb-1">
                      <FileText size={12} className="text-emerald-500" />
                      Current Project Data
                    </div>
                    <div className="space-y-0.5">
                      {dataResults.map((result, index) => (
                        <div
                          key={`data-${index}`}
                          onClick={() => handleDataClick(result)}
                          className="px-4 py-3 hover:bg-emerald-50/50 cursor-pointer rounded-lg transition-colors border-l-2 border-transparent hover:border-emerald-500"
                        >
                          <div className="text-sm font-bold text-slate-700">
                            Catch No: {result.catchNo}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-medium">
                            <span>Serial: {result.serialNumber || "N/A"}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                            <span>Qty: {result.nrQuantity || "N/A"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(groupResults.length === 0 && projectResults.length === 0 && dataResults.length === 0) && (
                  <div className="py-8 text-center">
                    <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm font-medium">No records found for "{searchQuery}"</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1 text-gray-800 hover:text-blue-600 focus:outline-none font-medium"
          >
            <span>Profile</span>
            <FiChevronDown className="text-lg" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-50">
              <ul className="py-1 text-sm text-gray-700">
                <li
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                  onClick={() => {
                    showToast("Profile settings clicked.", "info");
                    setDropdownOpen(false);
                  }}
                >
                  Profile Settings   
                </li>
                <li
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                  onClick={() => {
                    onLogout();
                    setDropdownOpen(false);
                  }}
                >
                  Logout
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
