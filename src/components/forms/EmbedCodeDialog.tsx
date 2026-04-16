"use client";

import { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Tabs,
    Tab,
    Box,
    Typography,
    Paper,
    IconButton,
    Stack,
    Tooltip,
    alpha,
    useTheme
} from '@mui/material';
import {
    ContentCopy as CopyIcon,
    Check as CheckIcon,
    Code as CodeIcon,
    Javascript as JavascriptIcon,
    Link as LinkIcon,
    Close as CloseIcon
} from '@mui/icons-material';

interface EmbedCodeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    formId: string;
    formName: string;
}

export function EmbedCodeDialog({ open, onOpenChange, formId, formName }: EmbedCodeDialogProps) {
    const theme = useTheme();
    const [activeTab, setActiveTab] = useState('iframe');
    const [copiedTab, setCopiedTab] = useState<string | null>(null);

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://yourcrm.com';

    const publicPath = `${baseUrl}/f/${formId}`;

    const iframeCode = `<iframe 
  src="${publicPath}" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: 1px solid #e5e7eb; border-radius: 8px;">
</iframe>`;

    const javascriptCode = `<div id="crm-form-${formId}"></div>
<script>
  (function() {
    var iframe = document.createElement('iframe');
    iframe.src = '${publicPath}';
    iframe.width = '100%';
    iframe.height = '600';
    iframe.frameBorder = '0';
    iframe.style.border = '1px solid #e5e7eb';
    iframe.style.borderRadius = '8px';
    document.getElementById('crm-form-${formId}').appendChild(iframe);
  })();
</script>`;

    const wordpressCode = `<!-- Add this shortcode to any page or post -->
[crm_form id="${formId}"]

<!-- Add this to your theme's functions.php -->
<?php
function crm_form_shortcode($atts) {
    $atts = shortcode_atts(array('id' => ''), $atts);
    return '<iframe src="${baseUrl}/f/' . $atts['id'] . '" width="100%" height="600" frameborder="0" style="border: 1px solid #e5e7eb; border-radius: 8px;"></iframe>';
}
add_shortcode('crm_form', 'crm_form_shortcode');
?>`;

    const directLink = publicPath;

    const copyToClipboard = async (text: string, tabName: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedTab(tabName);
            setTimeout(() => setCopiedTab(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const CodeBlock = ({ code }: { code: string }) => (
        <Paper
            variant="outlined"
            sx={{
                p: 2,
                bgcolor: 'grey.900',
                color: 'grey.100',
                overflowX: 'auto',
                fontFamily: 'monospace',
                fontSize: 13,
                borderRadius: 2,
                my: 2,
                position: 'relative'
            }}
        >
            <pre style={{ margin: 0 }}>{code}</pre>
        </Paper>
    );

    const handleClose = () => onOpenChange(false);

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: { borderRadius: 3 }
            }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                    <Typography variant="h6">Embed Form</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {formName}
                    </Typography>
                </Box>
                <IconButton onClick={handleClose} size="small">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                    <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} aria-label="embed options">
                        <Tab label="Iframe" value="iframe" icon={<CodeIcon fontSize="small" />} iconPosition="start" />
                        <Tab label="JavaScript" value="javascript" icon={<JavascriptIcon fontSize="small" />} iconPosition="start" />
                        <Tab label="WordPress" value="wordpress" />
                        <Tab label="Direct Link" value="link" icon={<LinkIcon fontSize="small" />} iconPosition="start" />
                    </Tabs>
                </Box>

                {activeTab === 'iframe' && (
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            Simple iframe embed - works on any HTML page.
                        </Typography>
                        <CodeBlock code={iframeCode} />
                        <Button
                            variant="contained"
                            startIcon={copiedTab === 'iframe' ? <CheckIcon /> : <CopyIcon />}
                            onClick={() => copyToClipboard(iframeCode, 'iframe')}
                            color={copiedTab === 'iframe' ? "success" : "primary"}
                        >
                            {copiedTab === 'iframe' ? "Copied!" : "Copy Code"}
                        </Button>
                    </Box>
                )}

                {activeTab === 'javascript' && (
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            JavaScript version - dynamically creates the iframe for better control.
                        </Typography>
                        <CodeBlock code={javascriptCode} />
                        <Button
                            variant="contained"
                            startIcon={copiedTab === 'javascript' ? <CheckIcon /> : <CopyIcon />}
                            onClick={() => copyToClipboard(javascriptCode, 'javascript')}
                            color={copiedTab === 'javascript' ? "success" : "primary"}
                        >
                            {copiedTab === 'javascript' ? "Copied!" : "Copy Code"}
                        </Button>
                    </Box>
                )}

                {activeTab === 'wordpress' && (
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            WordPress shortcode setup. Add the PHP code to your theme's functions.php first.
                        </Typography>
                        <CodeBlock code={wordpressCode} />
                        <Button
                            variant="contained"
                            startIcon={copiedTab === 'wordpress' ? <CheckIcon /> : <CopyIcon />}
                            onClick={() => copyToClipboard(wordpressCode, 'wordpress')}
                            color={copiedTab === 'wordpress' ? "success" : "primary"}
                        >
                            {copiedTab === 'wordpress' ? "Copied!" : "Copy Code"}
                        </Button>
                    </Box>
                )}

                {activeTab === 'link' && (
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            Direct link to the standalone form page.
                        </Typography>
                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2,
                                my: 2,
                                bgcolor: alpha(theme.palette.action.disabled, 0.05),
                                fontFamily: 'monospace',
                                wordBreak: 'break-all'
                            }}
                        >
                            {directLink}
                        </Paper>
                        <Stack direction="row" spacing={2}>
                            <Button
                                variant="contained"
                                startIcon={copiedTab === 'link' ? <CheckIcon /> : <CopyIcon />}
                                onClick={() => copyToClipboard(directLink, 'link')}
                                color={copiedTab === 'link' ? "success" : "primary"}
                            >
                                {copiedTab === 'link' ? "Copied!" : "Copy Link"}
                            </Button>
                            <Button
                                variant="outlined"
                                onClick={() => window.open(directLink, '_blank')}
                                startIcon={<LinkIcon />}
                            >
                                Open Preview
                            </Button>
                        </Stack>
                    </Box>
                )}

                <Paper
                    variant="outlined"
                    sx={{
                        mt: 4,
                        p: 2,
                        bgcolor: alpha(theme.palette.info.main, 0.05),
                        borderColor: alpha(theme.palette.info.main, 0.2)
                    }}
                >
                    <Typography variant="subtitle2" gutterBottom color="info.main">
                        Tips
                    </Typography>
                    <Typography variant="body2" component="ul" sx={{ pl: 2, color: 'text.secondary' }}>
                        <li>Adjust width and height values to fit your container</li>
                        <li>Add UTM parameters to the URL for better tracking</li>
                        <li>Submissions will appear instantly in your dashboard</li>
                    </Typography>
                </Paper>
            </DialogContent>
        </Dialog>
    );
}
