"use client";

import { useState } from 'react';
import {
    Check as CheckIcon,
    Code as CodeIcon,
    Copy as CopyIcon,
    ExternalLink as ExternalLinkIcon,
    FileCode as JavascriptIcon,
    Link as LinkIcon,
} from 'lucide-react';
import { StandardDialog } from '@/components/common/standard-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface EmbedCodeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    formId: string;
    formName: string;
}

function CodeBlock({ code }: { code: string }) {
    return (
        <pre className="my-2 overflow-x-auto rounded-lg border bg-neutral-900 p-4 font-mono text-[13px] text-neutral-100">
            {code}
        </pre>
    );
}

export function EmbedCodeDialog({ open, onOpenChange, formId, formName }: EmbedCodeDialogProps) {
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

    return (
        <StandardDialog
            open={open}
            onClose={() => onOpenChange(false)}
            title="Embed Form"
            subtitle={formName}
            icon={<CodeIcon className="size-4" />}
            maxWidth="md"
        >
            <Tabs defaultValue="iframe">
                <TabsList>
                    <TabsTrigger value="iframe">
                        <CodeIcon className="size-3.5" /> Iframe
                    </TabsTrigger>
                    <TabsTrigger value="javascript">
                        <JavascriptIcon className="size-3.5" /> JavaScript
                    </TabsTrigger>
                    <TabsTrigger value="wordpress">WordPress</TabsTrigger>
                    <TabsTrigger value="link">
                        <LinkIcon className="size-3.5" /> Direct Link
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="iframe">
                    <p className="text-sm text-muted-foreground">
                        Simple iframe embed - works on any HTML page.
                    </p>
                    <CodeBlock code={iframeCode} />
                    <Button onClick={() => copyToClipboard(iframeCode, 'iframe')}>
                        {copiedTab === 'iframe' ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                        {copiedTab === 'iframe' ? 'Copied!' : 'Copy Code'}
                    </Button>
                </TabsContent>

                <TabsContent value="javascript">
                    <p className="text-sm text-muted-foreground">
                        JavaScript version - dynamically creates the iframe for better control.
                    </p>
                    <CodeBlock code={javascriptCode} />
                    <Button onClick={() => copyToClipboard(javascriptCode, 'javascript')}>
                        {copiedTab === 'javascript' ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                        {copiedTab === 'javascript' ? 'Copied!' : 'Copy Code'}
                    </Button>
                </TabsContent>

                <TabsContent value="wordpress">
                    <p className="text-sm text-muted-foreground">
                        WordPress shortcode setup. Add the PHP code to your theme&apos;s functions.php first.
                    </p>
                    <CodeBlock code={wordpressCode} />
                    <Button onClick={() => copyToClipboard(wordpressCode, 'wordpress')}>
                        {copiedTab === 'wordpress' ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                        {copiedTab === 'wordpress' ? 'Copied!' : 'Copy Code'}
                    </Button>
                </TabsContent>

                <TabsContent value="link">
                    <p className="text-sm text-muted-foreground">
                        Direct link to the standalone form page.
                    </p>
                    <div className="my-2 break-all rounded-lg border bg-muted/40 p-3 font-mono text-sm">
                        {directLink}
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => copyToClipboard(directLink, 'link')}>
                            {copiedTab === 'link' ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                            {copiedTab === 'link' ? 'Copied!' : 'Copy Link'}
                        </Button>
                        <Button variant="outline" onClick={() => window.open(directLink, '_blank')}>
                            <LinkIcon className="size-4" />
                            Open Preview
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>

            <Alert variant="info" className="mt-6">
                <ExternalLinkIcon />
                <AlertTitle>Tips</AlertTitle>
                <AlertDescription>
                    <ul className={cn('list-disc pl-4')}>
                        <li>Adjust width and height values to fit your container</li>
                        <li>Add UTM parameters to the URL for better tracking</li>
                        <li>Submissions will appear instantly in your dashboard</li>
                    </ul>
                </AlertDescription>
            </Alert>
        </StandardDialog>
    );
}
