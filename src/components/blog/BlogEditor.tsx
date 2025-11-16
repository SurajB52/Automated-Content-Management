import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react';


import { FaBold, FaItalic, FaListUl, FaListOl, FaQuoteRight, 
         FaAlignLeft, FaAlignCenter, FaAlignRight, FaAlignJustify, FaStrikethrough, FaUnderline, FaCode, FaIndent, FaOutdent } from 'react-icons/fa';
import { BsTypeH1, BsTypeH2, BsTypeH3, BsLink45Deg } from 'react-icons/bs';
import { MdFormatClear } from 'react-icons/md';
import { BiParagraph } from 'react-icons/bi';
import { HiColorSwatch } from 'react-icons/hi';
import { IoText } from 'react-icons/io5';

import toast from 'react-hot-toast';

import { HexColorPicker } from 'react-colorful';

import Select, { SingleValue } from 'react-select';
import ADMIN_API_CONFIG, { getAdminUrl, adminFetch, adminApi } from '@/config/adminApi';
import { PlusIcon, XMarkIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

// Define Blog Group type
interface BlogGroup {
  id: number;
  name: string;
}

interface BlogEditorProps {
  initialContent: string;
  initialTitle: string;
  initialFeaturedImage: string;
  initialFeatureImageAlt: string;
  initialStatus: 'draft' | 'published';
  initialSeoTitle: string | null;
  initialSeoDescription: string | null;
  initialSeoKeywords: string | null;
  initialRichSchema: string | null;
  initialOgImage: string | null;
  initialBlogGroupId: number | null;
  blogId: number;
  hideBlocksSidebar?: boolean;
  hideRichSchema?: boolean;
  draggedImageUrl?: string | null;
  onDragComplete?: () => void;
  onFeatureImageChange?: (imageUrl: string, altText: string) => void;
  onBlogGroupChange?: (groupId: number | null) => void;
  onSave: (blogData: {
    title: string;
    content: string;
    featured_image: string;
    featured_image_alt: string;
    status: 'draft' | 'published';
    seo_title: string | null;
    seo_description: string | null;
    seo_keywords: string | null;
    rich_schema: string | null;
    og_image: string | null;
    blog_group_id: number | null;
  }) => Promise<void>;
}

// Define handle types for ref
export interface BlogEditorHandles {
  insertImage: (imageUrl: string) => void;
  saveDraft: () => Promise<void>; // Add saveDraft
  publish: () => Promise<void>; // Add publish
  insertBlock: (blockType: string) => void; // Add insertBlock
}

interface Format {
  type: string;
  icon: React.ReactNode;
  label: string;
  command?: string;
  value?: string;
  group?: string;
  options?: { label: string; value: string }[];
}

// Wrap component with forwardRef
const BlogEditor = forwardRef<BlogEditorHandles, BlogEditorProps>(({ 
  initialContent,
  initialTitle,
  initialFeaturedImage,
  initialFeatureImageAlt = '',
  initialStatus,
  initialSeoTitle = '',
  initialSeoDescription = '',
  initialSeoKeywords = '',
  initialRichSchema = '',
  initialOgImage = '',
  initialBlogGroupId,
  blogId,
  hideRichSchema = false,
  draggedImageUrl = null,
  onDragComplete,
  onFeatureImageChange,
  onBlogGroupChange,
  onSave
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // --- DEBUG LOG --- Check initial prop
  console.log('BlogEditor initialBlogGroupId:', initialBlogGroupId);

  const [title, setTitle] = useState(initialTitle);
  const [titleCharCount, setTitleCharCount] = useState(initialTitle?.length || 0);
  const [content, setContent] = useState(initialContent);
  const [featuredImage, setFeaturedImage] = useState(initialFeaturedImage);
  const [featureImageAlt, setFeatureImageAlt] = useState(initialFeatureImageAlt);

  // Keep internal preview in sync when parent updates initial values
  useEffect(() => {
    setFeaturedImage(initialFeaturedImage || '');
    setFeatureImageAlt(initialFeatureImageAlt || '');
  }, [initialFeaturedImage, initialFeatureImageAlt]);
  const [status] = useState<typeof initialStatus>(initialStatus);
  const [, setShowImageUploader] = useState(false);
  const [, setShowTableDialog] = useState(false);
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [tableRows, setTableRows] = useState(2);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [tableCols, setTableCols] = useState(2);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBgColorPicker, setShowBgColorPicker] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [selectedBgColor, setSelectedBgColor] = useState('#ffffff');
  const [currentFontSize, setCurrentFontSize] = useState('4'); // Default size (14px)
  const [seoTitle, setSeoTitle] = useState(initialSeoTitle || '');
  const [seoDescription, setSeoDescription] = useState(initialSeoDescription || '');
  const [seoKeywords, setSeoKeywords] = useState(() => {
    try {
      // If initialSeoKeywords is a JSON string, parse it and join with commas
      const parsed = JSON.parse(initialSeoKeywords || '[]');
      return Array.isArray(parsed) ? parsed.join(', ') : initialSeoKeywords || '';
    } catch {
      // If parsing fails, return the original string or empty string
      return initialSeoKeywords || '';
    }
  });
  const [richSchema, setRichSchema] = useState(initialRichSchema || '');
  const [ogImage] = useState(initialOgImage || '');
  const [isSeoExpanded, setIsSeoExpanded] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [colorPickerPosition, setColorPickerPosition] = useState({ x: 0, y: 0 });
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const [activeColorType, setActiveColorType] = useState<'text' | 'background' | null>(null);
  const [activeTab, setActiveTab] = useState('visual');
  const [rawContent, setRawContent] = useState('');
  const [blogGroups, setBlogGroups] = useState<BlogGroup[]>([]);
  const [selectedBlogGroupId, setSelectedBlogGroupId] = useState<number | null>(initialBlogGroupId);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const addGroupInputRef = useRef<HTMLInputElement>(null);

  // Track last image dropped for duplicate prevention
  const lastImageRef = useRef<{url: string, timestamp: number}>({url: '', timestamp: 0});

  // Removed formatting/extraction helpers to preserve exact HTML

  // Define a saved selection state to maintain cursor position
  const savedSelectionRef = useRef<Range | null>(null);

  const fontFamilies = [
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Times New Roman', value: '"Times New Roman", serif' },
    { label: 'Helvetica', value: 'Helvetica, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Courier New', value: '"Courier New", monospace' },
    { label: 'Verdana', value: 'Verdana, sans-serif' }
  ];

  const fontSizes = [
    { label: '8', value: '1' },
    { label: '10', value: '2' },
    { label: '12', value: '3' },
    { label: '14', value: '4' },
    { label: '16', value: '5' },
    { label: '18', value: '6' },
    { label: '20', value: '7' }
  ];

  const formats: Format[] = [
    { 
      type: 'h1', 
      icon: <BsTypeH1 size={20} />, 
      label: 'Heading 1', 
      command: 'formatBlock',
      value: 'h1',
      group: 'block'
    },
    { 
      type: 'h2', 
      icon: <BsTypeH2 size={20} />, 
      label: 'Heading 2', 
      command: 'formatBlock',
      value: 'h2',
      group: 'block'
    },
    { 
      type: 'h3', 
      icon: <BsTypeH3 size={20} />, 
      label: 'Heading 3', 
      command: 'formatBlock',
      value: 'h3',
      group: 'block'
    },
    { 
      type: 'paragraph', 
      icon: <BiParagraph size={20} />, 
      label: 'Paragraph', 
      command: 'formatBlock',
      value: 'p',
      group: 'block'
    },
    { 
      type: 'bold', 
      icon: <FaBold size={16} />, 
      label: 'Bold', 
      command: 'bold',
      group: 'inline'
    },
    { 
      type: 'italic', 
      icon: <FaItalic size={16} />, 
      label: 'Italic', 
      command: 'italic',
      group: 'inline'
    },
    { 
      type: 'underline', 
      icon: <FaUnderline size={16} />, 
      label: 'Underline', 
      command: 'underline',
      group: 'inline'
    },
    { 
      type: 'strikethrough', 
      icon: <FaStrikethrough size={16} />, 
      label: 'Strikethrough', 
      command: 'strikeThrough',
      group: 'inline'
    },
    { 
      type: 'align-left', 
      icon: <FaAlignLeft size={16} />, 
      label: 'Align Left', 
      command: 'justifyLeft',
      group: 'align'
    },
    { 
      type: 'align-center', 
      icon: <FaAlignCenter size={16} />, 
      label: 'Align Center', 
      command: 'justifyCenter',
      group: 'align'
    },
    { 
      type: 'align-right', 
      icon: <FaAlignRight size={16} />, 
      label: 'Align Right', 
      command: 'justifyRight',
      group: 'align'
    },
    { 
      type: 'align-justify', 
      icon: <FaAlignJustify size={16} />, 
      label: 'Justify', 
      command: 'justifyFull',
      group: 'align'
    },
    { 
      type: 'indent', 
      icon: <FaIndent size={16} />, 
      label: 'Increase Indent', 
      command: 'indent',
      group: 'indent'
    },
    { 
      type: 'outdent', 
      icon: <FaOutdent size={16} />, 
      label: 'Decrease Indent', 
      command: 'outdent',
      group: 'indent'
    },
    { 
      type: 'list-ul', 
      icon: <FaListUl size={16} />, 
      label: 'Bullet List', 
      command: 'insertUnorderedList',
      group: 'list'
    },
    { 
      type: 'list-ol', 
      icon: <FaListOl size={16} />, 
      label: 'Numbered List', 
      command: 'insertOrderedList',
      group: 'list'
    },
    { 
      type: 'link', 
      icon: <BsLink45Deg size={20} />, 
      label: 'Insert Link',
      command: 'createLink',
      group: 'insert'
    },
    { 
      type: 'code', 
      icon: <FaCode size={16} />, 
      label: 'Code Block', 
      command: 'formatBlock',
      value: 'pre',
      group: 'block'
    },
    { 
      type: 'quote', 
      icon: <FaQuoteRight size={16} />, 
      label: 'Blockquote', 
      command: 'formatBlock',
      value: 'blockquote',
      group: 'block'
    },
    { 
      type: 'clear', 
      icon: <MdFormatClear size={20} />, 
      label: 'Clear Formatting', 
      command: 'removeFormat',
      group: 'other'
    },
    {
      type: 'fontFamily',
      icon: <IoText size={20} />,
      label: 'Font Family',
      command: 'fontName',
      group: 'font',
      options: fontFamilies
    },
    {
      type: 'fontSize',
      icon: <IoText size={16} />,
      label: 'Font Size',
      command: 'fontSize',
      group: 'font',
      options: fontSizes
    },
    {
      type: 'textColor',
      icon: <HiColorSwatch size={16} />,
      label: 'Text Color',
      command: 'foreColor',
      group: 'color'
    },
    {
      type: 'backgroundColor',
      icon: <HiColorSwatch size={16} className="rotate-180" />,
      label: 'Background Color',
      command: 'hiliteColor',
      group: 'color'
    }
  ];

  const presetColors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', 
    '#FFFF00', '#FF00FF', '#00FFFF', '#808080', '#800000',
    '#808000', '#008000', '#800080', '#008080', '#000080'
  ];

  useEffect(() => {
    if (editorRef.current && initialContent && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = initialContent;
    }
    // Initialize raw content exactly as stored (no formatting)
    setRawContent(initialContent);
  }, [initialContent]);

  // Sync visual editor when switching to visual mode or when content changes
  useEffect(() => {
    if (activeTab === 'visual' && editorRef.current) {
      // Only update if the editor content is different from current content
      const currentEditorContent = editorRef.current.innerHTML;
      if (content && currentEditorContent !== content) {
        console.log('Syncing visual editor with content:', content);
        editorRef.current.innerHTML = content;
      }
      // Update counts on tab switch and content sync
      updateWordCount();
    }
  }, [activeTab, content]);

  // Keep word counts updated when content string changes programmatically
  useEffect(() => {
    updateWordCount(content);
  }, [content]);

  // Track if user has manually edited the rich schema
  const richSchemaEditedRef = useRef(false);

  // Update richSchema when initialRichSchema prop changes (but only if user hasn't edited it)
  useEffect(() => {
    if (initialRichSchema !== null && initialRichSchema !== undefined && !richSchemaEditedRef.current) {
      setRichSchema(initialRichSchema || '');
    }
  }, [initialRichSchema]);

  // Fetch blog groups on mount
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        // Use the admin API endpoint
        const groupsUrl = getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.groups);
        const response = await adminFetch(groupsUrl); // Use adminFetch
        
        // Check content type before parsing JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const groupsData = await response.json();
            if ((groupsData.success === true || groupsData.status === 'success') && Array.isArray(groupsData.data)) {
              setBlogGroups(groupsData.data);
              // --- DEBUG LOG --- Check fetched groups
              console.log('BlogEditor fetched groups:', groupsData.data);
            } else {
              console.error('Fetched groups data is not in the expected format:', groupsData);
              toast.error(groupsData.message || 'Failed to load blog groups: Invalid format');
            }
        } else {
            const text = await response.text();
            console.error('Non-JSON response from groups endpoint:', text);
            toast.error('Server returned an unexpected response for groups.');
        }
      } catch (error) {
        toast.error(`Error loading blog groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error('Error fetching groups:', error);
      }
    };
    fetchGroups();
  }, []);

  // Keep selected category in sync if parent updates initialBlogGroupId
  useEffect(() => {
    setSelectedBlogGroupId(initialBlogGroupId);
  }, [initialBlogGroupId]);

  // Enhance Add Category modal UX: autofocus and keyboard shortcuts
  useEffect(() => {
    if (showAddGroupModal) {
      // Focus input after modal renders
      setTimeout(() => addGroupInputRef.current?.focus(), 0);

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowAddGroupModal(false);
        } else if (e.key === 'Enter') {
          if (!isAddingGroup && newGroupName.trim()) {
            // submit
            handleAddBlogGroup();
          }
        }
      };
      // Lock body scroll
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKeyDown);
      return () => {
        window.removeEventListener('keydown', onKeyDown);
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [showAddGroupModal, isAddingGroup, newGroupName]);

  // Prepare options for react-select
  const selectOptions = useMemo(() => blogGroups.map(group => ({ value: group.id, label: group.name })), [blogGroups]);

  // Determine the currently selected value object for react-select
  const currentSelectValue = useMemo(() => {
    if (selectedBlogGroupId === null) return null;
    const foundOption = selectOptions.find(option => option.value === selectedBlogGroupId) || null;
    // --- DEBUG LOG --- Check calculated select value
    console.log('BlogEditor calculated currentSelectValue:', foundOption, 'based on selectedBlogGroupId:', selectedBlogGroupId, 'and options:', selectOptions);
    return foundOption;
  }, [selectOptions, selectedBlogGroupId]);

  // --- DEBUG LOG --- Check selectedBlogGroupId state changes
  console.log('BlogEditor selectedBlogGroupId state:', selectedBlogGroupId);

  const handleContentChange = useCallback(() => {
    // Prefer the visual editor div when present
    if (activeTab === 'visual' && editorRef.current) {
      const html = editorRef.current.innerHTML;
      if (html !== content) {
        setContent(html);
        updateWordCount();
      }
      return;
    }
    // Fallback to iframe if used
    const iframeDoc = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document;
    if (iframeDoc && activeTab === 'visual') {
      const html = iframeDoc.body.innerHTML;
      if (html !== content) {
        setContent(html);
        updateWordCount();
      }
      return;
    }
  }, [content, activeTab]);

  // Removed iframe sync effect to rely on direct contentEditable rendering

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    handleContentChange();
  };

  const handleYouTubeUrlChange = useCallback((event: Event) => {
    const input = event.target as HTMLInputElement;
    const url = input.value;
    const videoId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/i)?.[1];
    const container = input.parentElement?.nextElementSibling as HTMLElement;
    
    if (videoId && container) {
      const videoContainer = document.createElement('div');
      videoContainer.className = 'video-container w-full bg-white rounded-lg';
      videoContainer.style.minHeight = '250px';
      videoContainer.style.maxHeight = '450px';
      
      videoContainer.innerHTML = `
        <div class='relative w-full' style='padding-bottom: 56.25%'>
          <iframe 
            src='https://www.youtube.com/embed/${videoId}?rel=0' 
            class='absolute inset-0 w-full h-full rounded-lg'
            title='YouTube video player'
            loading='lazy'
            allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
            allowfullscreen
          ></iframe>
        </div>
      `;
      
      container.innerHTML = '';
      container.appendChild(videoContainer);
    }
  }, []);

  const handleInsertBlock = useCallback((blockType: string) => {
    const selection = window.getSelection();
    if (!selection || !editorRef.current) return;

    const range = selection.getRangeAt(0);
    const blockElement = document.createElement('div');
    blockElement.className = 'block my-4';

    switch (blockType) {
      case 'quote':
        blockElement.innerHTML = `
          <blockquote class="relative border-l-4 border-gray-300 pl-4 py-2 my-4">
            <div contenteditable="true" class="text-lg text-gray-700">Enter quote...</div>
            <div contenteditable="true" class="mt-2 text-sm text-gray-500 italic">Attribution...</div>
          </blockquote>
        `;
        break;

      case 'cta':
        // CTA block with new default text and appearance
        blockElement.innerHTML = `
          <div class="my-6 p-8 rounded-lg text-center cta-block" 
              style="background-color: #f9fafb;" 
              data-heading-color="#000000" 
              data-button-color="#2563eb" 
              data-button-text-color="#ffffff" 
              data-background-color="#f9fafb">
            <div class="absolute top-2 right-2 cta-settings-toggle">
              <button class="bg-white p-2 rounded-full shadow text-gray-600 hover:text-gray-800">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                </svg>
              </button>
            </div>
            <div contenteditable="true" class="text-2xl font-bold mb-6" style="color: #000000;" placeholder="Enter your text here">Enter your text here</div>
            <div class="flex max-w-lg mx-auto">
              <input type="text" placeholder="Enter your suburb or postcode" class="flex-grow p-3 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
              <button contenteditable="true" class="px-6 py-3 rounded-r-md font-semibold focus:outline-none hover:opacity-90" style="background-color: #2563eb; color: #ffffff;">Submit</button>
            </div>
          </div>
        `;
        
        // Add event listener for the settings button (same logic as before)
        setTimeout(() => {
          const settingsToggle = blockElement.querySelector('.cta-settings-toggle button');
          const ctaBlock = blockElement.querySelector('.cta-block');
          
          if (settingsToggle && ctaBlock) {
            settingsToggle.addEventListener('click', () => {
              let settingsPanel = blockElement.querySelector('.cta-settings-panel');
              if (!settingsPanel) {
                const headingColor = ctaBlock.getAttribute('data-heading-color') || '#000000';
                const buttonColor = ctaBlock.getAttribute('data-button-color') || '#2563eb';
                const buttonTextColor = ctaBlock.getAttribute('data-button-text-color') || '#ffffff';
                const backgroundColor = ctaBlock.getAttribute('data-background-color') || '#f9fafb';
                
                settingsPanel = document.createElement('div');
                settingsPanel.className = 'cta-settings-panel mt-4 p-4 bg-white rounded-lg shadow-md border';
                settingsPanel.innerHTML = `
                  <h3 class="text-lg font-medium text-gray-900 mb-4">CTA Settings</h3>
                  <div class="space-y-2 mb-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Input Placeholder</label>
                      <input type="text" value="Enter your suburb or postcode" class="w-full p-2 text-sm border-gray-300 rounded cta-input-placeholder"/>
                    </div>
                  </div>
                  <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Background Color</label>
                        <div class="flex items-center">
                          <div class="w-8 h-8 rounded border" style="background-color: ${backgroundColor};"></div>
                          <input type="text" value="${backgroundColor}" class="ml-2 w-24 text-sm border-gray-300 rounded bg-color-input" data-target="background"/>
                        </div>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Heading Color</label>
                        <div class="flex items-center">
                          <div class="w-8 h-8 rounded border" style="background-color: ${headingColor};"></div>
                          <input type="text" value="${headingColor}" class="ml-2 w-24 text-sm border-gray-300 rounded heading-color-input" data-target="heading"/>
                        </div>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Button Color</label>
                        <div class="flex items-center">
                          <div class="w-8 h-8 rounded border" style="background-color: ${buttonColor};"></div>
                          <input type="text" value="${buttonColor}" class="ml-2 w-24 text-sm border-gray-300 rounded button-color-input" data-target="button"/>
                        </div>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Button Text Color</label>
                        <div class="flex items-center">
                          <div class="w-8 h-8 rounded border" style="background-color: ${buttonTextColor};"></div>
                          <input type="text" value="${buttonTextColor}" class="ml-2 w-24 text-sm border-gray-300 rounded button-text-color-input" data-target="buttonText"/>
                        </div>
                      </div>
                    </div>
                    <div class="pt-4 flex justify-end">
                      <button class="close-settings px-4 py-2 bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 focus:outline-none">Done</button>
                    </div>
                  </div>
                `;
                blockElement.appendChild(settingsPanel);
                
                const placeholderInput = settingsPanel.querySelector('.cta-input-placeholder') as HTMLInputElement;
                const mainInput = ctaBlock.querySelector('input[type="text"]');
                if(placeholderInput && mainInput) {
                  placeholderInput.addEventListener('input', (e) => {
                    (mainInput as HTMLInputElement).placeholder = (e.target as HTMLInputElement).value;
                  });
                }

                const colorInputs = settingsPanel.querySelectorAll('input[type="text"][data-target]');
                colorInputs.forEach(input => {
                  input.addEventListener('change', (e) => {
                    const target = (e.target as HTMLInputElement).getAttribute('data-target');
                    const value = (e.target as HTMLInputElement).value;
                    ctaBlock.setAttribute(`data-${target}-color`, value);
                    if (target === 'background') {
                      (ctaBlock as HTMLElement).style.backgroundColor = value;
                    } else if (target === 'heading') {
                      const headingElement = ctaBlock.querySelector('.text-2xl.font-bold');
                      if (headingElement) (headingElement as HTMLElement).style.color = value;
                    } else if (target === 'button') {
                      const buttonElement = ctaBlock.querySelector('button.font-semibold');
                      if (buttonElement) (buttonElement as HTMLElement).style.backgroundColor = value;
                    } else if (target === 'buttonText') {
                      const buttonElement = ctaBlock.querySelector('button.font-semibold');
                      if (buttonElement) (buttonElement as HTMLElement).style.color = value;
                    }
                  });
                });
                const closeButton = settingsPanel.querySelector('.close-settings');
                if (closeButton && settingsPanel) {
                  closeButton.addEventListener('click', () => {
                    (settingsPanel as HTMLElement).remove();
                  });
                }
              } else {
                settingsPanel.remove();
              }
            });
          }
        }, 0);
        break;

      case 'faq':
        blockElement.innerHTML = `
          <div class="my-6 space-y-4">
            <div class="border rounded-lg overflow-hidden shadow-sm">
              <div class="bg-white p-4 cursor-pointer hover:bg-gray-50" onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('svg').classList.toggle('rotate-180')">
                <div class="flex justify-between items-center">
                  <div contenteditable="true" class="font-medium text-lg">Question 1: Enter your question here</div>
                  <svg class="w-5 h-5 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <div class="hidden border-t">
                <div contenteditable="true" class="p-4 bg-gray-50">
                  Enter your answer here...
                </div>
              </div>
            </div>
            <div class="border rounded-lg overflow-hidden shadow-sm">
              <div class="bg-white p-4 cursor-pointer hover:bg-gray-50" onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('svg').classList.toggle('rotate-180')">
                <div class="flex justify-between items-center">
                  <div contenteditable="true" class="font-medium text-lg">Question 2: Enter your question here</div>
                  <svg class="w-5 h-5 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <div class="hidden border-t">
                <div contenteditable="true" class="p-4 bg-gray-50">
                  Enter your answer here...
                </div>
              </div>
            </div>
          </div>
        `;
        break;

      case 'stats':
        blockElement.innerHTML = `
          <div class="my-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div class="p-6 bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow">
                <div contenteditable="true" class="text-4xl font-bold text-blue-600 mb-2">100+</div>
                <div contenteditable="true" class="text-lg font-medium text-gray-900 mb-1">Metric Title</div>
                <div contenteditable="true" class="text-sm text-gray-500">Brief description or context about this metric</div>
              </div>
              <div class="p-6 bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow">
                <div contenteditable="true" class="text-4xl font-bold text-green-600 mb-2">95%</div>
                <div contenteditable="true" class="text-lg font-medium text-gray-900 mb-1">Metric Title</div>
                <div contenteditable="true" class="text-sm text-gray-500">Brief description or context about this metric</div>
              </div>
              <div class="p-6 bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow">
                <div contenteditable="true" class="text-4xl font-bold text-purple-600 mb-2">50K</div>
                <div contenteditable="true" class="text-lg font-medium text-gray-900 mb-1">Metric Title</div>
                <div contenteditable="true" class="text-sm text-gray-500">Brief description or context about this metric</div>
              </div>
            </div>
          </div>
        `;
        break;

      case 'video':
        blockElement.innerHTML = `
          <div class="my-6">
            <div class="bg-white rounded-lg border shadow-sm p-6 max-w-3xl mx-auto">
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">YouTube Video URL</label>
                <input type="text" 
                  placeholder="Paste YouTube URL here (e.g., https://www.youtube.com/watch?v=...)" 
                  class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div class="w-full bg-gray-50 rounded-lg flex items-center justify-center" style="min-height: 250px; max-height: 450px">
                <div class="text-gray-500 text-center p-4">
                  <svg class="w-12 h-12 mx-auto mb-2 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                  </svg>
                  <p class="text-sm">Enter a YouTube URL above to embed the video</p>
                </div>
              </div>
              <div class="mt-3">
                <div contenteditable="true" class="text-sm text-gray-500 italic">
                  Add a caption or description for the video...
                </div>
              </div>
            </div>
          </div>
        `;

        // Add event listener after the block is inserted
        setTimeout(() => {
          const input = blockElement.querySelector('input');
          if (input) {
            input.addEventListener('change', handleYouTubeUrlChange);
          }
        }, 0);
        break;
    }

    range.deleteContents();
    range.insertNode(blockElement);
    handleContentChange();
  }, [handleYouTubeUrlChange, handleContentChange]);

  // Implement reliable drag and drop functionality for the editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    
    // Track recent drops to prevent duplicates
    let lastDroppedUrl = '';
    let lastDropTimestamp = 0;
    let isDraggingInside = false;
    
    // Style for the drag over state
    const addDragOverClass = () => {
      editor.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50');
    };
    
    const removeDragOverClass = () => {
      editor.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50');
    };
    
    // Handle dragover event - crucial for enabling drops
    const handleDragOver = (e: DragEvent) => {
      // This is essential - without preventDefault, the drop event won't fire
      e.preventDefault();
      
      // Set the drop effect to copy (shows the + icon)
      e.dataTransfer!.dropEffect = 'copy';
      
      if (!isDraggingInside) {
        isDraggingInside = true;
        // Add visual feedback
        addDragOverClass();
      }
    };
    
    // Handle dragenter event
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      isDraggingInside = true;
      addDragOverClass();
    };
    
    // Handle dragleave event to remove styling
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      
      // Check if we're leaving the editor completely, not just moving between child elements
      const rect = editor.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      
      // If the cursor is outside the editor boundaries
      if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
        isDraggingInside = false;
        removeDragOverClass();
      }
    };
    
    // Handle drop event
    const handleDrop = (e: DragEvent) => {
      // Prevent default browser behavior
      e.preventDefault();
      e.stopPropagation();
      
      // Remove styling
      removeDragOverClass();
      isDraggingInside = false;
      
      // Get the data from dataTransfer
      const url = e.dataTransfer!.getData('text/plain');
      const currentTime = Date.now();
      
      // Prevent duplicate drops (same URL within 1 second)
      if (url === lastDroppedUrl && currentTime - lastDropTimestamp < 1000) {
        console.log('Ignoring duplicate drop');
        return;
      }
      
      // Update last drop tracking
      lastDroppedUrl = url;
      lastDropTimestamp = currentTime;
      
      // Log for debugging
      console.log('Drop received with URL:', url);
      
      // Check if the URL is an image (improve this validation as needed)
      if (url && (
        url.includes('/uploads/') || 
        url.startsWith('http') && (
          url.endsWith('.jpg') || 
          url.endsWith('.jpeg') || 
          url.endsWith('.png') || 
          url.endsWith('.gif') || 
          url.endsWith('.webp')
        )
      )) {
        // Get the current selection or create one
        const selection = window.getSelection();
        if (!selection) {
          return;
        }
        
        try {
          let range;
          try {
            // Try to use the current selection
            range = selection.getRangeAt(0);
            
            // Make sure the selection is inside the editor
            let container = range.commonAncestorContainer;
            let isInEditor = false;
            
            // Check if we're inside the editor element
            while (container) {
              if (container === editor) {
                isInEditor = true;
                break;
              }
              container = container.parentNode as Node;
            }
            
            // If not in editor, throw to create a new range
            if (!isInEditor) {
              throw new Error('Selection not in editor');
            }
          } catch {
            // Create a new range at the end of the editor
            range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false); // End of content
            selection.removeAllRanges();
            selection.addRange(range);
          }
          
          // Inject the image at the current selection
          const imgElement = document.createElement('img');
          imgElement.src = url;
          imgElement.alt = 'Inserted image';
          imgElement.className = 'max-w-full h-auto rounded-lg my-2';
          imgElement.style.maxHeight = '400px';
          
          // Insert the image
          range.deleteContents();
          range.insertNode(imgElement);
          
          // Move cursor after the inserted image
          range.setStartAfter(imgElement);
          range.setEndAfter(imgElement);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          
          // Update editor content state
          handleContentChange();
          
          // Focus back on editor
          editor.focus();
          
          console.log('Image inserted successfully');
        } catch (error) {
          console.error('Error inserting image:', error);
        }
      } else {
        console.warn('Dropped item is not a valid image URL:', url);
      }
    };
    
    // Add event listeners
    editor.addEventListener('dragover', handleDragOver);
    editor.addEventListener('dragenter', handleDragEnter);
    editor.addEventListener('dragleave', handleDragLeave);
    editor.addEventListener('drop', handleDrop);
    
    // Clean up
    return () => {
      editor.removeEventListener('dragover', handleDragOver);
      editor.removeEventListener('dragenter', handleDragEnter);
      editor.removeEventListener('dragleave', handleDragLeave);
      editor.removeEventListener('drop', handleDrop);
    };
  }, [handleContentChange]);

  const handleFormat = (format: Format, event?: React.MouseEvent) => {
    switch (format.type) {
      case 'link':
        const selection = window.getSelection();
        if (selection && selection.toString()) {
          const url = prompt('Enter URL:', 'https://');
          if (url) {
            execCommand('createLink', url);
          }
        } else {
          toast('Please select text to create a link');
        }
        break;
      case 'image':
        setShowImageUploader(true);
        break;
      case 'table':
        setShowTableDialog(true);
        break;
      case 'textColor':
        if (event) handleColorPickerOpen('text', event);
        break;
      case 'backgroundColor':
        if (event) handleColorPickerOpen('background', event);
        break;
      default:
        if (format.command) {
          execCommand(format.command, format.value || '');
        }
    }
  };

  // Define handleImageDrop function first before using it in other functions
  const handleImageDrop = useCallback((imageUrl: string) => {
    if (!editorRef.current) return;

    // Prevent duplicate inserts
    const currentTime = Date.now();
    if (imageUrl === lastImageRef.current.url && 
        currentTime - lastImageRef.current.timestamp < 1000) {
      console.log('Ignoring duplicate image insert');
      return;
    }
    
    // Update tracking
    lastImageRef.current = {url: imageUrl, timestamp: currentTime};

    // Get the current selection or create one
    const selection = window.getSelection();
    if (!selection) return;
    
    let range;
    try {
      // Try to use the current selection
      range = selection.getRangeAt(0);
      
      // Make sure the selection is inside the editor
      let container = range.commonAncestorContainer;
      let isInEditor = false;
      
      // Check if we're inside the editor element
      while (container) {
        if (container === editorRef.current) {
          isInEditor = true;
          break;
        }
        container = container.parentNode as Node;
      }
      
      // If not in editor, throw to create a new range
      if (!isInEditor) {
        throw new Error('Selection not in editor');
      }
    } catch {
      // Create a new range at the end of the editor
      range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false); // End of content
      selection.removeAllRanges();
      selection.addRange(range);
    }
    
    // Inject the image at the current selection
    const imgElement = document.createElement('img');
    imgElement.src = imageUrl;
    imgElement.alt = 'Inserted image';
    imgElement.className = 'max-w-full h-auto rounded-lg my-2';
    imgElement.style.maxHeight = '400px';
    
    // Insert the image
    range.deleteContents();
    range.insertNode(imgElement);
    
    // Move cursor after the inserted image
    range.setStartAfter(imgElement);
    range.setEndAfter(imgElement);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Update editor content state
    handleContentChange();
    
    // Focus back on editor
    editorRef.current.focus();
    
    console.log('Image inserted successfully via handleImageDrop');
  }, [handleContentChange]);

  // Save editor selection when focus or click happens
  const saveCurrentSelection = useCallback(() => {
    if (!editorRef.current) return;
    
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      
      // Check if the range is within our editor
      let container = range.commonAncestorContainer;
      let isInEditor = false;
      
      while (container) {
        if (container === editorRef.current) {
          isInEditor = true;
          break;
        }
        container = container.parentNode as Node;
      }
      
      if (isInEditor) {
        savedSelectionRef.current = range.cloneRange();
      }
    }
  }, []);

  // Add event listeners to save selection on editor interaction
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    
    const handleEditorFocus = () => saveCurrentSelection();
    const handleEditorClick = () => saveCurrentSelection();
    const handleEditorBlur = () => {
      // Save selection when editor loses focus (e.g., clicking on image gallery)
      setTimeout(() => saveCurrentSelection(), 0);
    };
    
    editor.addEventListener('focus', handleEditorFocus);
    editor.addEventListener('click', handleEditorClick);
    editor.addEventListener('keyup', handleEditorFocus);
    editor.addEventListener('blur', handleEditorBlur);
    
    return () => {
      editor.removeEventListener('focus', handleEditorFocus);
      editor.removeEventListener('click', handleEditorClick);
      editor.removeEventListener('keyup', handleEditorFocus);
      editor.removeEventListener('blur', handleEditorBlur);
    };
  }, [saveCurrentSelection]);

  // Insert image helper function
  const insertImage = useCallback((imageUrl: string) => {
    // Prevent duplicate image insertions in quick succession
    const now = Date.now();
    if (lastImageRef.current.url === imageUrl && now - lastImageRef.current.timestamp < 500) {
      return;
    }
    
    // Update last image reference
    lastImageRef.current = { url: imageUrl, timestamp: now };
    
    try {
      if (editorRef.current) {
        // Try to restore saved selection
        const selection = window.getSelection();
        if (selection && savedSelectionRef.current) {
          // Clear any existing selection
          selection.removeAllRanges();
          
          try {
            // Try to use the saved selection
            selection.addRange(savedSelectionRef.current);
            
            // Insert the image at the current selection
            const imgHtml = `<img src="${imageUrl}" alt="" class="blog-image max-w-full h-auto rounded-lg my-2" style="max-height: 400px;" />`;
            document.execCommand('insertHTML', false, imgHtml);
            
            // Focus back on editor
            editorRef.current.focus();
            
            // Save editor state
            handleContentChange();
            
            console.log('Image inserted at saved cursor position');
          } catch (e) {
            console.error('Error restoring selection:', e);
            // If restoring the selection fails, fallback to inserting at the current position
            document.execCommand('insertHTML', false, `<img src="${imageUrl}" alt="" class="blog-image max-w-full h-auto rounded-lg my-2" style="max-height: 400px;" />`);
            handleContentChange();
          }
        } else {
          // No saved selection, insert at current position or end
          let currentRange = null;
          
          if (selection && selection.rangeCount > 0) {
            currentRange = selection.getRangeAt(0);
          }
          
          if (!currentRange) {
            // If no current range, select end of editor
            currentRange = document.createRange();
            currentRange.selectNodeContents(editorRef.current);
            currentRange.collapse(false); // End of content
            
            try {
              selection?.removeAllRanges();
              selection?.addRange(currentRange);
            } catch (_e) {
              console.error('Error setting selection range:', _e);
            }
          }
          
          // Insert the image
          document.execCommand('insertHTML', false, `<img src="${imageUrl}" alt="" class="blog-image max-w-full h-auto rounded-lg my-2" style="max-height: 400px;" />`);
          
          // Update editor content state
          handleContentChange();
        }
      }
    } catch (error) {
      // Handle any unexpected errors during image insertion
      console.error('Error during image insertion:', error);
      
      // Attempt a fallback method if primary method fails
      try {
        if (editorRef.current) {
          // Add image at the end as a fallback
          const imgHtml = `<img src="${imageUrl}" alt="" class="blog-image max-w-full h-auto rounded-lg my-2" style="max-height: 400px;" />`;
          
          // Just append to the editor's innerHTML as last resort
          editorRef.current.innerHTML += imgHtml;
          handleContentChange();
          
          // Scroll to the newly added image
          editorRef.current.scrollTop = editorRef.current.scrollHeight;
        }
      } catch (e) {
        console.error('Fatal error inserting image:', e);
        toast.error('Failed to insert image. Please try again.');
      }
    }
    console.log('Image inserted via ref');
  }, [handleContentChange, savedSelectionRef]);

  // Removed unused helper functions: _handleImageUploadSuccess, _handleInsertLink, _handleInsertTable

  // Modify handleSave/handlePublish to format keywords back to JSON
const formatKeywordsForSave = (keywords: unknown) => {
  // Accept string | string[] | null/undefined and normalize to string[]
  let arr: string[] = [];
  if (Array.isArray(keywords)) {
    arr = keywords
      .map(k => (typeof k === 'string' ? k : String(k)))
      .map(k => k.trim())
      .filter(k => k.length > 0);
  } else if (typeof keywords === 'string') {
    arr = keywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
  } else if (keywords && typeof keywords === 'object') {
    // If an object slipped through (e.g., parsed JSON), attempt to extract values
    try {
      const vals = Object.values(keywords as Record<string, unknown>);
      arr = vals
        .map(v => (typeof v === 'string' ? v : String(v)))
        .map(k => k.trim())
        .filter(k => k.length > 0);
    } catch (e) {
      console.error('Error parsing keywords object:', e);
      arr = [];
    }
  } else {
    arr = [];
  }
  return JSON.stringify(arr);
};

  const handleSave = async () => {
    if (onSave) {
      try {
        let contentToSave = '';
        
        // Get content based on active tab
        if (activeTab === 'visual') {
          if (editorRef.current) {
            contentToSave = editorRef.current.innerHTML;
          } else {
            const iframeDoc = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document;
            if (iframeDoc) contentToSave = iframeDoc.body.innerHTML;
          }
        } else if (activeTab === 'raw') {
          contentToSave = rawContent;
        } else {
          contentToSave = content;
        }
        
        // Safety check - warn if content is empty
        if (!contentToSave.trim() && content.trim()) {
          const confirmed = window.confirm(
            'Warning: The content appears to be empty. This might cause data loss. Are you sure you want to save?'
          );
          if (!confirmed) {
            return;
          }
        }
        
        console.log('Saving content:', contentToSave);
        
        await onSave({
          title,
          content: contentToSave,
          featured_image: featuredImage,
          featured_image_alt: featureImageAlt,
          status: 'draft',
          seo_title: seoTitle || null,
          seo_description: seoDescription || null,
          seo_keywords: seoKeywords ? formatKeywordsForSave(seoKeywords) : null,
          rich_schema: hideRichSchema ? null : (richSchema || null),
          og_image: ogImage || null,
          blog_group_id: selectedBlogGroupId
        });
        // Silence internal success toast to avoid duplicates; the parent page handles success notifications.
      } catch (error) {
        console.error('Error saving draft:', error);
        toast.error('Failed to save draft');
      }
    }
  };

  const handlePublish = async () => {
    if (onSave) {
      try {
        let contentToSave = '';
        
        // Get content based on active tab
        if (activeTab === 'visual' && editorRef.current) {
          contentToSave = editorRef.current.innerHTML;
        } else if (activeTab === 'raw') {
          contentToSave = rawContent;
        } else {
          contentToSave = content;
        }
        
        // Safety check - warn if content is empty
        if (!contentToSave.trim()) {
          toast.error('Cannot publish empty content. Please add some content first.');
          return;
        }
        
        console.log('Publishing content:', contentToSave);
        
        await onSave({
          title,
          content: contentToSave,
          featured_image: featuredImage,
          featured_image_alt: featureImageAlt,
          status: 'published',
          seo_title: seoTitle || null,
          seo_description: seoDescription || null,
          seo_keywords: seoKeywords ? formatKeywordsForSave(seoKeywords) : null,
          rich_schema: hideRichSchema ? null : (richSchema || null),
          og_image: ogImage || null,
          blog_group_id: selectedBlogGroupId
        });
        // Silence internal success toast; parent decides final notification.
      } catch (error) {
        console.error('Error publishing blog:', error);
        toast.error('Failed to publish blog');
      }
    }
  };

  const handleFontSizeChange = (size: string) => {
    setCurrentFontSize(size);
    
    // Apply to selected text
    execCommand('fontSize', size);

    // Focus back on editor
    if (editorRef.current) {
      editorRef.current.focus();
    }
  };

  const renderToolbarGroup = (group: string) => {
    const groupFormats = formats.filter(f => f.group === group);
    return groupFormats.map((format) => {
      if (format.type === 'fontSize') {
        return (
          <select
            key={format.type}
            value={currentFontSize}
            onChange={(e) => handleFontSizeChange(e.target.value)}
            className="h-6 px-1 py-0.5 border rounded text-xs bg-white min-w-[48px]"
            title={format.label}
          >
            {format.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}px
              </option>
            ))}
          </select>
        );
      }
      return (
        <button
          key={format.type}
          onClick={(e) => handleFormat(format, e as React.MouseEvent)}
          className="p-1 text-gray-600 hover:bg-gray-100 rounded"
          title={format.label}
        >
          {format.icon}
        </button>
      );
    });
  };

  const updateWordCount = (htmlSource?: string) => {
    let text = '';
    if (htmlSource !== undefined) {
      const tmp = document.createElement('div');
      tmp.innerHTML = htmlSource;
      text = tmp.textContent || '';
    } else if (activeTab === 'visual' && editorRef.current) {
      text = editorRef.current.textContent || '';
    } else if (activeTab === 'raw') {
      const tmp = document.createElement('div');
      tmp.innerHTML = rawContent || '';
      text = tmp.textContent || '';
    }
    const words = text.trim().length ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharCount(text.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      handleInsertBlock('paragraph');
    }
  };

  const handleFeatureImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB');
      return;
    }

    try {
      setFeaturedImage(''); // Clear existing image
      const formData = new FormData();
      formData.append('image', file);
      formData.append('blog_id', blogId.toString());
      formData.append('is_feature_image', 'true');
      formData.append('alt_text', featureImageAlt);

      // Use the admin API endpoint for blog images
      const uploadUrl = getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.images.upload);
      
      const response = await adminFetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: {} // Don't set Content-Type for FormData, let browser set it
      });

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Handle non-JSON response (like HTML error messages)
        const text = await response.text();
        console.error('Non-JSON response from server:', text);
        toast.error('Server returned an invalid response. Please try again.');
        return;
      }

      const result = await response.json();
      
      if (result.status === 'success' && result.data) {
        let imageUrl = '';
        
        // Handle different response formats
        if (typeof result.data === 'string') {
          imageUrl = result.data;
        } else if (result.data.url) {
          imageUrl = result.data.url;
        } else if (result.data.path) {
          imageUrl = result.data.path;
        } else {
          console.error('Unexpected response format:', result);
          toast.error('Unexpected response format from server');
          return;
        }
        
        // Update blog with new feature image and alt text, preserving SEO fields
        const updateUrl = getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.posts.update);
        const updateResult = await adminFetch(updateUrl, {
          method: 'POST',
          body: JSON.stringify({
            id: blogId,
            featured_image: imageUrl,
            featured_image_alt: featureImageAlt,
            title,
            content,
            status,
            seo_title: seoTitle || null,
            seo_description: seoDescription || null,
            seo_keywords: seoKeywords || null,
            og_image: ogImage || null,
            blog_group_id: selectedBlogGroupId
          })
        });

        // Check if update response is JSON
        const updateContentType = updateResult.headers.get('content-type');
        if (!updateContentType || !updateContentType.includes('application/json')) {
          const text = await updateResult.text();
          console.error('Non-JSON response from update endpoint:', text);
          toast.error('Server returned an invalid response when updating image. Please try again.');
          return;
        }

        const updateData = await updateResult.json();

        if (updateData.success === true || updateData.status === 'success') {
          setFeaturedImage(imageUrl);
          toast.success('Feature image updated successfully');
          // Call the callback to notify parent
          if (onFeatureImageChange) {
            onFeatureImageChange(imageUrl, featureImageAlt);
          }
        } else {
          toast.error(updateData.message || 'Failed to update feature image');
        }
      } else {
        toast.error(result.message || 'Failed to upload feature image');
      }
    } catch (error) {
      console.error('Error uploading feature image:', error);
      toast.error('Failed to upload feature image');
    }
  };

  const handleFeatureImageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    // Handle image URL dropped from ImageGallery
    const imageUrl = e.dataTransfer.getData('text/plain');
    if (imageUrl && imageUrl.includes('/uploads/blog/')) {
      try {
        console.log('Image URL:', imageUrl);
        const fullImageUrl = imageUrl; // Use the URL directly
        console.log('Using Image URL:', fullImageUrl);
        
        // Use the admin API endpoint
        const updateUrl = getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.posts.update);
        const response = await adminFetch(updateUrl, {
          method: 'POST',
          body: JSON.stringify({
            id: blogId,
            featured_image: fullImageUrl,
            featured_image_alt: featureImageAlt,
            title,
            content,
            status,
            seo_title: seoTitle || null,
            seo_description: seoDescription || null,
            seo_keywords: seoKeywords || null,
            og_image: ogImage || null,
            blog_group_id: selectedBlogGroupId
          })
        });

        const result = await response.json();

        if (result.success === true || result.status === 'success') {
          setFeaturedImage(fullImageUrl);
          toast.success('Feature image updated successfully');
          // Call the callback to notify parent
          if (onFeatureImageChange) {
            onFeatureImageChange(fullImageUrl, featureImageAlt);
          }
        } else {
          toast.error(result.message || 'Failed to update feature image');
        }
      } catch (error) {
        console.error('Error updating feature image:', error);
        toast.error('Failed to update feature image');
      }
      return;
    }

    // Handle file drop from computer
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      await handleFeatureImageUpload(file);
    }
  };

  const handleRemoveFeatureImage = async () => {
    try {
      // Use the admin API endpoint
      const updateUrl = getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.posts.update);
      const response = await adminFetch(updateUrl, {
        method: 'POST',
        body: JSON.stringify({
          id: blogId,
          featured_image: '',
          featured_image_alt: '',
          title,
          content,
          status,
          seo_title: seoTitle || null,
          seo_description: seoDescription || null,
          seo_keywords: seoKeywords || null,
          og_image: ogImage || null,
          blog_group_id: selectedBlogGroupId
        })
      });

      const result = await response.json();

      if (result.success === true || result.status === 'success') {
        setFeaturedImage('');
        setFeatureImageAlt('');
        toast.success('Feature image removed successfully');
        // Call the callback to notify parent
        if (onFeatureImageChange) {
          onFeatureImageChange('', '');
        }
      } else {
        toast.error(result.message || 'Failed to remove feature image');
      }
    } catch (error) {
      console.error('Error removing feature image:', error);
      toast.error('Failed to remove feature image');
    }
  };

  // Add click outside handler for color picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false);
        setShowBgColorPicker(false);
        setActiveColorType(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleColorPickerOpen = (type: 'text' | 'background', event: React.MouseEvent) => {
    const button = event.currentTarget as HTMLButtonElement;
    const rect = button.getBoundingClientRect();
    setColorPickerPosition({
      x: rect.left,
      y: rect.bottom + window.scrollY
    });
    setActiveColorType(type);
    if (type === 'text') {
      setShowColorPicker(true);
      setShowBgColorPicker(false);
    } else {
      setShowBgColorPicker(true);
      setShowColorPicker(false);
    }
  };

  const handleColorChange = (color: string) => {
    if (activeColorType === 'text') {
      setSelectedColor(color);
      execCommand('foreColor', color);
    } else {
      setSelectedBgColor(color);
      execCommand('hiliteColor', color);
    }
  };

  // Handle image dragged from gallery
  useEffect(() => {
    if (draggedImageUrl && editorRef.current) {
      handleImageDrop(draggedImageUrl);
      
      // Call onDragComplete to reset draggedImageUrl
      if (onDragComplete) {
        onDragComplete();
      }
    }
  }, [draggedImageUrl, handleImageDrop, onDragComplete]);

  // Expose insertImage, saveDraft, and publish via useImperativeHandle
  useImperativeHandle(ref, () => ({
    insertImage,
    saveDraft: handleSave, // Expose handleSave
    publish: handlePublish,      // Expose handlePublish
    insertBlock: (blockType: string) => handleInsertBlock(blockType)  // Expose handleInsertBlock
  }), [insertImage, handleSave, handlePublish, handleInsertBlock]);

  // Corrected handler for react-select
  const handleBlogGroupChange = (selectedOption: SingleValue<{ value: number; label: string }>) => {
    const newGroupId = selectedOption ? selectedOption.value : null;
    setSelectedBlogGroupId(newGroupId);
    if (onBlogGroupChange) {
      onBlogGroupChange(newGroupId); // Call the passed handler
    }
  };

  // Add new function to handle adding a blog group
  const handleAddBlogGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error('Please enter a category name');
      return;
    }
    
    try {
      setIsAddingGroup(true);
      const result = await adminApi.addBlogGroup(newGroupName.trim());
      
      if (result.status === 'success' && result.data) {
        // Add the new group to the local state
        const newGroup = { id: result.data.id, name: result.data.name };
        setBlogGroups(prev => [...prev, newGroup]);
        
        // Select the newly created group
        setSelectedBlogGroupId(newGroup.id);
        if (onBlogGroupChange) {
          onBlogGroupChange(newGroup.id);
        }
        
        // Reset the form
        setNewGroupName('');
        setShowAddGroupModal(false);
        toast.success('Blog category added successfully');
      } else {
        toast.error(result.message || 'Failed to add category');
      }
    } catch (error) {
      console.error('Error adding blog category:', error);
      toast.error(`Failed to add category: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAddingGroup(false);
    }
  };

  // Handle tab switching with proper content synchronization
  const handleTabSwitch = useCallback((newTab: string) => {
    console.log('Switching from', activeTab, 'to', newTab);
    
    if (newTab === 'raw' && activeTab === 'visual') {
      // Switching from visual to raw
      if (editorRef.current) {
        const currentContent = editorRef.current.innerHTML;
        console.log('Visual content to convert:', currentContent);
        
        if (currentContent.trim()) {
          // Use content exactly as-is
          setRawContent(currentContent);
          setContent(currentContent);
        } else {
          // Leave empty when there is no content
          setRawContent('');
        }
      }
    } else if (newTab === 'visual' && activeTab === 'raw') {
      // Switching from raw to visual
      console.log('Raw content to extract:', rawContent);
      
      if (rawContent.trim()) {
        const exactContent = rawContent;
        console.log('Using exact raw content for visual:', exactContent);
        
        if (editorRef.current) {
          // Use setTimeout to ensure the tab switch happens first
          setTimeout(() => {
            if (editorRef.current) {
              editorRef.current.innerHTML = exactContent;
              setContent(exactContent);
            }
          }, 0);
        }
      }
    }
    
    setActiveTab(newTab);
  }, [activeTab, rawContent]);

  // Handle raw content changes
  const handleRawContentChange = useCallback((newRawContent: string) => {
    console.log('Raw content changed:', newRawContent);
    setRawContent(newRawContent);
    
    // Keep content state exactly in sync with raw (no extraction)
    setContent(newRawContent);
  }, []);

  return (
    <div className="relative min-h-screen bg-gray-50">
      {/* Main Editor Area - Scrollable */}
      <div className="p-4 pb-2">
        <div className="space-y-4">

          {/* Featured Image Section - Enhanced with preview and remove */}
          <div className="bg-white border border-gray-200/60 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="px-4 py-3 bg-gradient-to-r from-green-50/50 to-emerald-50/30 border-b border-gray-200/60">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Featured Image</h3>
              </div>
            </div>
            
            <div className="p-4">
              {featuredImage ? (
                <div className="space-y-3">
                  {/* Image Preview */}
                  <div className="relative group">
                    <img
                      src={featuredImage}
                      alt={featureImageAlt || 'Featured image'}
                      className="w-full h-48 object-cover rounded-lg shadow-sm border border-gray-200"
                    />
                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={handleRemoveFeatureImage}
                      className="absolute top-2 right-2 p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove featured image"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Alt Text */}
                  <div>
                    <label htmlFor="featureImageAlt" className="block text-xs font-medium text-gray-700 mb-1">
                      Alt Text
                    </label>
                    <input
                      type="text"
                      id="featureImageAlt"
                      value={featureImageAlt}
                      onChange={(e) => setFeatureImageAlt(e.target.value)}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 text-sm px-3 py-2"
                      placeholder="Describe the image for accessibility"
                    />
                  </div>
                </div>
              ) : (
                <div 
                  className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
                    isDraggingOver ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(true);
                  }}
                  onDragLeave={() => setIsDraggingOver(false)}
                  onDrop={handleFeatureImageDrop}
                >
                  <div className="text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-600 font-medium">Drag and drop an image here</p>
                    <p className="text-xs text-gray-500 mb-3">or</p>
                    <label className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer transition-colors">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Choose File
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleFeatureImageUpload(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                    <p className="mt-2 text-xs text-gray-500">PNG, JPG, GIF up to 5MB</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Blog Category Section - Modern Design */}
          <div className="bg-white border border-gray-200/60 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="px-4 py-3 bg-gradient-to-r from-purple-50/50 to-pink-50/30 border-b border-gray-200/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                    Blog Category
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddGroupModal(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors text-xs font-semibold shadow-sm"
                  title="Add New Category"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  <span>Add New</span>
                </button>
              </div>
            </div>
            <div className="p-4">
              <Select<{ value: number; label: string }, false>
                instanceId="blog-group-select"
                options={selectOptions}
                value={currentSelectValue}
                onChange={handleBlogGroupChange}
                isClearable={true}
                isSearchable={true}
                placeholder="Select a category..."
                className="text-sm"
                classNamePrefix="react-select"
                menuPortalTarget={typeof window !== 'undefined' ? document.body : undefined}
                menuPosition="fixed"
                styles={{
                  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                  menu: (base) => ({ ...base, zIndex: 9999 })
                }}
              />
            </div>
          </div>

          {/* Add Blog Category Modal */}
          {showAddGroupModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAddGroupModal(false)}>
              <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl ring-1 ring-black/5" role="dialog" aria-modal="true" aria-labelledby="add-category-title" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                  <h3 id="add-category-title" className="text-lg font-semibold text-gray-900">Add New Blog Category</h3>
                  <button
                    type="button"
                    onClick={() => setShowAddGroupModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="new-group-name" className="block text-sm font-medium text-gray-700">
                      Category Name
                    </label>
                    <input
                      type="text"
                      id="new-group-name"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      ref={addGroupInputRef}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      placeholder="Enter category name"
                    />
                  </div>
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowAddGroupModal(false)}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddBlogGroup}
                      disabled={isAddingGroup || !newGroupName.trim()}
                      className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                        isAddingGroup || !newGroupName.trim() ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
                      }`}
                    >
                      {isAddingGroup ? 'Adding...' : 'Add Category'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SEO Section - Modern Professional Design */}

          <div className="bg-white border border-gray-200/60 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div 
              className="flex items-center justify-between cursor-pointer px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200/60"
              onClick={() => setIsSeoExpanded(!isSeoExpanded)}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h3 className="text-sm font-bold text-gray-800">SEO Settings</h3>
                <span className="text-xs text-gray-500 bg-blue-100 px-2 py-0.5 rounded-full">Search Optimization</span>
              </div>
              <div className="flex items-center">
                {isSeoExpanded ? (
                  <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4 text-gray-500" />
                )}
              </div>
            </div>
            {isSeoExpanded && (
              <div className="p-4 space-y-4 bg-white">
                {/* SEO Title */}
                <div className="bg-gradient-to-r from-blue-50/30 to-indigo-50/20 rounded-lg p-3 border border-blue-100/50">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase tracking-wide">
                      <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      SEO Title
                    </label>
                    <span className="text-xs text-gray-500 font-medium">{seoTitle.length}/60</span>
                  </div>
                  <input
                    type="text"
                    value={seoTitle}
                    onChange={(e) => setSeoTitle(e.target.value)}
                    maxLength={60}
                    className="block w-full rounded-lg border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2"
                    placeholder="Optimized title for search results (max 60 chars)"
                  />
                </div>

                {/* SEO Description */}
                <div className="bg-gradient-to-r from-green-50/30 to-emerald-50/20 rounded-lg p-3 border border-green-100/50">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase tracking-wide">
                      <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                      </svg>
                      Meta Description
                    </label>
                    <span className="text-xs text-gray-500 font-medium">{seoDescription.length}/160</span>
                  </div>
                  <textarea
                    value={seoDescription}
                    onChange={(e) => setSeoDescription(e.target.value)}
                    rows={3}
                    maxLength={160}
                    className="block w-full rounded-lg border-gray-300 bg-white shadow-sm focus:border-green-500 focus:ring-green-500 text-sm px-3 py-2"
                    placeholder="Compelling description for search results (max 160 chars)"
                  />
                </div>

                {/* SEO Keywords */}
                <div className="bg-gradient-to-r from-purple-50/30 to-violet-50/20 rounded-lg p-3 border border-purple-100/50">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                    <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    </svg>
                    Keywords
                  </label>
                  <input
                    type="text"
                    value={seoKeywords}
                    onChange={(e) => setSeoKeywords(e.target.value)}
                    className="block w-full rounded-lg border-gray-300 bg-white shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm px-3 py-2"
                    placeholder="keyword1, keyword2, keyword3 (comma-separated)"
                  />
                </div>

                {/* Rich Schema */}
                {!hideRichSchema && (
                <div className="bg-gradient-to-r from-orange-50/30 to-amber-50/20 rounded-lg p-3 border border-orange-100/50">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
                    <svg className="w-3.5 h-3.5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Rich Schema (JSON-LD)
                  </label>
                  <textarea
                    value={richSchema}
                    onChange={(e) => {
                      setRichSchema(e.target.value);
                      richSchemaEditedRef.current = true;
                    }}
                    rows={4}
                    className="block w-full rounded-lg border-gray-300 bg-white shadow-sm focus:border-orange-500 focus:ring-orange-500 text-xs px-3 py-2 font-mono"
                    placeholder='{"@context": "https://schema.org", "@type": "Article", ...}'
                  />
                  <p className="mt-1.5 text-xs text-gray-500 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    Structured data for better search visibility
                  </p>
                </div>
                )}
              </div>
            )}
          </div>

          {/* Title Input - Modern Professional Design (Moved below SEO) */}
          <div className="bg-white border border-gray-200/60 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="px-4 py-3 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 border-b border-gray-200/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <label htmlFor="title" className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                    Blog Title
                  </label>
                </div>
                <button
                  type="button"
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Generate AI Title"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-4">
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setTitleCharCount(e.target.value.length); }}
                className="block w-full text-sm font-medium border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 bg-white"
                placeholder="Enter a compelling blog title..."
                autoComplete="off"
                autoCapitalize="sentences"
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  Optimal: 50-70 characters
                </p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                  titleCharCount >= 50 && titleCharCount <= 70
                    ? 'bg-green-100 text-green-700'
                    : titleCharCount < 50
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                }`}>
                  {titleCharCount}
                </span>
              </div>
            </div>
          </div>

          {/* Editor Content */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            {/* Internal scroll area so sticky pins to editor top */}
            <div className="max-h-[80vh] overflow-y-auto">
            {/* Sticky Toolbar Wrapper */}
            <div className="sticky top-0 bg-gray-50/95 supports-[backdrop-filter]:bg-gray-50/80 backdrop-blur z-20 border-b border-gray-200">
              {/* Font Controls */}
              <div className="flex items-center space-x-0.5 px-2 py-1 border-b">
                {renderToolbarGroup('font')}
                <div className="h-5 border-l mx-1" />
                {renderToolbarGroup('color')}
              </div>
              
              {/* Main Toolbar Row 1 */}
              <div className="flex flex-wrap items-center space-x-0.5 px-2 py-1 border-b">
                {renderToolbarGroup('block')}
                <div className="h-5 border-l mx-1" />
                {renderToolbarGroup('inline')}
                <div className="h-5 border-l mx-1" />
                {renderToolbarGroup('align')}
                <div className="h-5 border-l mx-1" />
                {renderToolbarGroup('list')}
              </div>

              {/* Main Toolbar Row 2 (New) */}
              <div className="flex flex-wrap items-center space-x-0.5 px-2 py-1 border-b">
                {renderToolbarGroup('indent')}
                <div className="h-5 border-l mx-1" />
                {renderToolbarGroup('insert')}
                <div className="h-5 border-l mx-1" />
                {renderToolbarGroup('other')}
              </div>
            </div>

            {/* Tab Interface */}
            <div className="bg-gray-50 border-b">
              <div className="flex">
                <button
                  onClick={() => handleTabSwitch('visual')}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    activeTab === 'visual'
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Visual Editor
                </button>
                <button
                  onClick={() => handleTabSwitch('raw')}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    activeTab === 'raw'
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Raw HTML
                </button>
              </div>
              {activeTab === 'raw' && (
                <div className="px-4 py-2 text-xs text-gray-600 bg-yellow-50 border-t">
                  <strong>Raw HTML Mode:</strong>
                </div>
              )}
            </div>

            {/* Editor Views */}
            {activeTab === 'visual' ? (
              <div
                ref={editorRef}
                className="blog-editor-content min-h-[600px] p-8 sm:p-10 lg:p-12 focus:outline-none bg-white"
                onInput={handleContentChange}
                onKeyDown={handleKeyDown}
                contentEditable
                suppressContentEditableWarning={true}
              />
            ) : (
              <textarea
                value={rawContent}
                onChange={(e) => {
                  handleRawContentChange(e.target.value);
                  updateWordCount(e.target.value);
                }}
                className="min-h-[500px] w-full p-4 font-mono text-sm focus:outline-none resize-none border-none"
                style={{ 
                  minHeight: '500px',
                  backgroundColor: '#1e1e1e',
                  color: '#d4d4d4',
                  lineHeight: '1.6',
                  tabSize: 2,
                  fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace'
                }}
                spellCheck={false}
                placeholder="<article>
  <!-- Your HTML content goes here -->
</article>"
              />
            )}

            {/* Word Count */}
            <div className="bg-gray-50 px-4 py-2 text-xs text-gray-600 border-t border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="font-medium">Words: {wordCount}</span>
                <span className="text-gray-300">|</span>
                <span className="font-medium">Characters: {charCount}</span>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Color Picker Popup */}
      {(showColorPicker || showBgColorPicker) && (
        <div
          ref={colorPickerRef}
          className="absolute z-50 bg-white p-4 rounded-lg shadow-lg border"
          style={{
            top: colorPickerPosition.y,
            left: colorPickerPosition.x,
          }}
        >
          <div className="mb-2 font-medium">
            {activeColorType === 'text' ? 'Text Color' : 'Background Color'}
          </div>
          <div className="mb-4 grid grid-cols-5 gap-1">
            {presetColors.map((color) => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                className="w-6 h-6 rounded border border-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500"
                style={{ 
                  backgroundColor: color,
                  boxShadow: color === (activeColorType === 'text' ? selectedColor : selectedBgColor) 
                    ? '0 0 0 2px #3B82F6' 
                    : 'none' 
                }}
                title={color}
              />
            ))}
          </div>
          <HexColorPicker
            color={activeColorType === 'text' ? selectedColor : selectedBgColor}
            onChange={handleColorChange}
          />
          <div className="mt-2 flex justify-between">
            <input
              type="text"
              value={activeColorType === 'text' ? selectedColor : selectedBgColor}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
        </div>
      )}

      {/* Fixed Bottom Toolbar with Save Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex justify-end space-x-4 shadow-lg z-40">
        <button
          onClick={handleSave}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          Save Draft
        </button>
        <button
          onClick={handlePublish}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          Publish
        </button>
      </div>
    </div>
  );
});

export default BlogEditor;
BlogEditor.displayName = 'BlogEditor';